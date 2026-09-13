import { fetchSeason, fetchMapping, fetchManifest } from './js/fetch-data.js';
import { getFT, fixtureKey } from './js/normalize.js';
import { compareTeam } from './js/compare.js';
import { mergeMatches } from './js/merge.js';
import { loadManual, saveManual } from './js/storage.js';
import { encodeManual, decodeManual, readUrlState, writeUrlState } from './js/url.js';

const seasonA = document.getElementById('seasonA');
const seasonB = document.getElementById('seasonB');
const teamSel = document.getElementById('teamSel');
const tbody = document.getElementById('tbody');
const vThis = document.getElementById('vThis'), vLast = document.getElementById('vLast'), vDelta = document.getElementById('vDelta');
const kA = document.getElementById('kA'), kB = document.getElementById('kB'), kThis = document.getElementById('kThis'), kLast = document.getElementById('kLast'), kDelta = document.getElementById('kDelta');
const summaryNote = document.getElementById('summaryNote');
const tableTitle = document.getElementById('tableTitle'), tableMeta = document.getElementById('tableMeta');
const bannerHost = document.getElementById('banner-host');
const manifestHost = document.getElementById('manifestHost');
const addBtn = document.getElementById('addBtn'), shareBtn = document.getElementById('shareBtn'), exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');
const dialog = document.getElementById('editDialog');
const fDate = document.getElementById('fDate'), fHome = document.getElementById('fHome'), fAway = document.getElementById('fAway'), fHg = document.getElementById('fHg'), fAg = document.getElementById('fAg'), fRound = document.getElementById('fRound'), fKey = document.getElementById('fKey');

let allSeasonsData = {};
let mapping = {};
let teamsBySeason = {};
let currentTeam = '';

function loadDeleted(season){ try{return new Set(JSON.parse(localStorage.getItem('epl-deleted-'+season)||'[]'))}catch{return new Set()} }
function saveDeleted(season,set){ localStorage.setItem('epl-deleted-'+season, JSON.stringify([...set])) }

function seasonsFromManifest(manifest){
  return manifest?.seasons || ['2026-27','2025-26','2024-25','2023-24','2022-23'];
}

function populateSeasonSelects(seasons, defA='2026-27', defB='2025-26'){
  for (const sel of [seasonA, seasonB]){
    sel.innerHTML='';
    for (const s of seasons){
      const o=document.createElement('option'); o.value=s; o.textContent=s; sel.appendChild(o);
    }
  }
  const urlState = readUrlState();
  // legacy support: ?season=2025-26 or ?a=&b=
  let a = urlState.a || defA;
  let b = urlState.b || defB;
  if (urlState.season && !urlState.a) {
    // old single param like ?season=2025-26 -> treat as A, infer B as previous
    a = urlState.season;
    const idx = seasons.indexOf(a);
    b = seasons[idx+1] || seasons[1] || defB;
  }
  if (seasons.includes(a)) seasonA.value=a; else seasonA.value=defA;
  if (seasons.includes(b)) seasonB.value=b; else seasonB.value=defB;
  // ensure A != B
  if (seasonA.value===seasonB.value){
    const idx = seasons.indexOf(seasonA.value);
    seasonB.value = seasons[idx+1] || seasons.find(s=>s!==seasonA.value);
  }
}

async function init(){
  const manifest = await fetchManifest();
  const seasons = seasonsFromManifest(manifest);
  if (manifest) manifestHost.textContent = seasons.join(' · ');

  mapping = await fetchMapping();

  populateSeasonSelects(seasons.slice().reverse().length? seasons.slice().reverse() : seasons);
  // Actually we want newest first in dropdown: reverse already? manifest is oldest->newest, we want newest first
  // seasons currently is old->new, reverse for UI newest first but keep values correct
  // Our populate used seasons as given; we want newest first visually, so rebuild
  const newestFirst = [...seasons].reverse();
  populateSeasonSelects(newestFirst);

  // Load all seasons in parallel
  await Promise.all(seasons.map(async s=>{
    try{
      const raw = await fetchSeason(s);
      allSeasonsData[s]={raw, matches:raw.matches};
      teamsBySeason[s]=[...new Set(raw.matches.flatMap(m=>[m.team1,m.team2]))].sort();
    }catch(e){ console.warn('load',s,e)}
  }));

  // Banner for shared
  const urlState = readUrlState();
  if (urlState.m){
    const shared = decodeManual(urlState.m);
    if (shared.length){
      bannerHost.innerHTML=`<div class="banner"><span>${shared.length} shared results</span><span style="display:flex;gap:6px"><button id="applyShared" class="primary" style="padding:4px 8px;font-size:12px">Save</button><button id="dismissShared" style="padding:4px 8px;font-size:12px">Dismiss</button></span></div>`;
      document.getElementById('applyShared').onclick=()=>{
        const cur = seasonA.value;
        const existing=loadManual(cur);
        const map=new Map(existing.map(e=>[fixtureKey(e.team1||e.home,e.team2||e.away,e.date),e]));
        for(const s of shared) map.set(fixtureKey(s.team1||s.home,s.team2||s.away,s.date),s);
        saveManual(cur,[...map.values()]);
        bannerHost.innerHTML='';
        const p=new URLSearchParams(location.search); p.delete('m'); history.replaceState(null,'',location.pathname+(p.toString()?'?'+p.toString():''));
        refresh();
      };
      document.getElementById('dismissShared').onclick=()=>{
        const p=new URLSearchParams(location.search); p.delete('m'); history.replaceState(null,'',location.pathname+(p.toString()?'?'+p.toString():''));
        bannerHost.innerHTML=''; refresh();
      };
    }
  }

  const pendingTeam = urlState.team || '';
  updateTeamOptions(pendingTeam);
  currentTeam = teamSel.value;

  seasonA.addEventListener('change', ()=>{ if(seasonA.value===seasonB.value){ // auto bump B
    const seasons=[...seasonA.options].map(o=>o.value);
    const idx=seasons.indexOf(seasonA.value);
    seasonB.value=seasons[idx+1]||seasons.find(s=>s!==seasonA.value);
  } updateTeamOptions(); writeUrl(); refresh(); });
  seasonB.addEventListener('change', ()=>{ if(seasonA.value===seasonB.value){ const seasons=[...seasonB.options].map(o=>o.value); const idx=seasons.indexOf(seasonB.value); seasonA.value=seasons[idx+1]||seasons.find(s=>s!==seasonA.value); updateTeamOptions();} writeUrl(); refresh(); });
  teamSel.addEventListener('change', ()=>{ currentTeam=teamSel.value; writeUrl(); refresh(); });
  addBtn.addEventListener('click', ()=>openDialog(null));
  shareBtn.addEventListener('click', copyShareLink);
  exportBtn.addEventListener('click', exportJson);
  importFile.addEventListener('change', importJson);
  document.getElementById('cancelBtn').addEventListener('click', ()=>dialog.close());
  document.getElementById('editForm').addEventListener('submit', onSave);

  writeUrl();
  refresh();
}

function updateTeamOptions(preferred){
  const teams = teamsBySeason[seasonA.value] || [];
  const prevVal = preferred || teamSel.value;
  teamSel.innerHTML='';
  for(const t of teams){ const o=document.createElement('option'); o.value=t; o.textContent=t.replace(' FC','').replace(' AFC',''); teamSel.appendChild(o); }
  if(prevVal && teams.includes(prevVal)) teamSel.value=prevVal;
  else if(teams.includes('Arsenal FC')) teamSel.value='Arsenal FC';
  else if(teams[0]) teamSel.value=teams[0];
  fHome.innerHTML=''; fAway.innerHTML='';
  for(const t of teams){ const o1=document.createElement('option'); o1.value=t; o1.textContent=t.replace(' FC',''); const o2=o1.cloneNode(true); fHome.appendChild(o1); fAway.appendChild(o2); }
  currentTeam=teamSel.value;
}

function getEffectiveMatches(season){
  const base=(allSeasonsData[season]?.matches)||[];
  const urlState=readUrlState();
  let manual=[];
  let deleted=loadDeleted(season);
  const isCurrent = season===seasonA.value;
  if(isCurrent){
    if(urlState.m){ const shared=decodeManual(urlState.m); if(shared.length) manual=shared; else manual=loadManual(season); }
    else manual=loadManual(season);
  }
  const norm = manual.map(m=>({team1:m.team1||m.home, team2:m.team2||m.away, date:m.date, round:m.round||'Manual', score:m.score||{ft:m.ft}, _manualId:m._manualId}));
  return mergeMatches(base, norm, deleted);
}

function writeUrl(){
  const manual = loadManual(seasonA.value);
  const urlState=readUrlState();
  const toEncode = urlState.m ? decodeManual(urlState.m) : manual;
  writeUrlState({team:currentTeam, a:seasonA.value, b:seasonB.value, manual:toEncode});
}

function refresh(){
  if(!teamSel.value) return;
  const cur=seasonA.value, prev=seasonB.value;
  const curMatches=getEffectiveMatches(cur);
  const prevMatches=getEffectiveMatches(prev);
  const key=`${prev}->${cur}`;
  const rev=`${cur}->${prev}`;
  let map=mapping[key]||mapping[rev] && Object.fromEntries(Object.entries(mapping[rev]).map(([k,v])=>[v,k])) || {};
  // mapping is directional prev->cur, but we may have stored only one direction; handle both
  if(!mapping[key] && mapping[rev]){} // already handled
  else map=mapping[key]||{};
  const cmp=compareTeam(teamSel.value, curMatches, prevMatches, map);
  render(cmp, cur, prev, map);
}

function render(cmp, curLabel, prevLabel, map){
  const {thisPts,lastPts,delta,comparable,proxyCount,rows}=cmp;
  kA.textContent=curLabel; kB.textContent=prevLabel;
  vThis.textContent=thisPts; vLast.textContent=lastPts; vDelta.textContent=(delta>0?'+':'')+delta;
  vDelta.className='v '+(delta>0?'pos':delta<0?'neg':'neu');
  kThis.textContent=`${rows.filter(r=>r.isPlayed).length}/${rows.length} played`;
  kLast.textContent=`${comparable} comp`+(proxyCount?` · ${proxyCount} prox`:'');
  kDelta.textContent= comparable? (delta>0?'↑':delta<0?'↓':'→') : '';
  summaryNote.textContent = proxyCount ? `${proxyCount} prox (1→18)` : '';
  tableTitle.textContent=cmp.team.replace(' FC','').replace(' AFC','');
  tableMeta.textContent=`${rows.length} fx`;

  tbody.innerHTML='';
  for(const r of rows){
    const ftCur=r.ftCur?`${r.ftCur[0]}-${r.ftCur[1]}`:'–';
    const ftLast=r.ftLast?`${r.ftLast[0]}-${r.ftLast[1]}`:'–';
    const d = (r.isPlayed && r.last && r.ftLast) ? (r.curPts - r.lastPts) : null;
    const dStr=d===null?'–':(d>0?`+${d}`:`${d}`);
    const dCls=d===null?'':d>0?'pos':d<0?'neg':'';
    const opp=r.opp.replace(' FC','').replace(' AFC','').replace('Brighton & Hove Albion','Brighton');
    const badges=(r.cur&&r.cur._source==='manual'?'<span class="badge manual">M</span>':'')+(r.proxy?'<span class="badge proxy">P</span>':'');
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${opp}${badges}</td><td class="muted" style="font-size:11px">${r.venue}</td><td>${ftCur}</td><td class="muted">${ftLast}</td><td class="delta ${dCls}">${dStr}</td><td><button class="small" data-edit="${r.cur._key}" style="padding:2px 6px;font-size:11px;border:1px solid #e2e8f0;border-radius:4px;background:#fff">✎</button> <button data-del="${r.cur._key}" style="padding:2px 6px;font-size:11px;border:1px solid #fee2e2;border-radius:4px;background:#fff;color:#dc2626">×</button></td>`;
    tbody.appendChild(tr);
  }
  if(rows.length===0) tbody.innerHTML='<tr><td colspan="6" class="muted">—</td></tr>';
  tbody.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{
    const k=b.getAttribute('data-edit');
    const ms=getEffectiveMatches(seasonA.value);
    openDialog(ms.find(x=>x._key===k));
  }));
  tbody.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>{
    if(!confirm('Delete?')) return;
    const k=b.getAttribute('data-del');
    const cur=seasonA.value;
    const manual=loadManual(cur);
    const idx=manual.findIndex(x=>fixtureKey(x.team1||x.home,x.team2||x.away,x.date)===k);
    if(idx!==-1){ manual.splice(idx,1); saveManual(cur,manual); }
    else { const del=loadDeleted(cur); del.add(k); saveDeleted(cur,del); }
    refresh(); writeUrl();
  }));
}

function openDialog(existing){
  if(existing){
    fDate.value=existing.date||''; fHome.value=existing.team1; fAway.value=existing.team2;
    const ft=getFT(existing.score); fHg.value=ft?ft[0]:''; fAg.value=ft?ft[1]:''; fRound.value=existing.round||''; fKey.value=existing._key;
    document.getElementById('dialogTitle').textContent='Edit';
  } else {
    fDate.value=new Date().toISOString().slice(0,10); fHome.value=currentTeam; const teams=teamsBySeason[seasonA.value]||[]; fAway.value=teams.find(t=>t!==currentTeam)||teams[0]||''; fHg.value=''; fAg.value=''; fRound.value='Manual'; fKey.value=''; document.getElementById('dialogTitle').textContent='Add';
  }
  dialog.showModal();
}
function onSave(e){
  e.preventDefault();
  const cur=seasonA.value;
  const home=fHome.value, away=fAway.value, date=fDate.value, hg=Number(fHg.value), ag=Number(fAg.value), round=fRound.value||'Manual', oldKey=fKey.value;
  if(home===away) return alert('Home ≠ Away');
  if(!date||isNaN(hg)||isNaN(ag)) return alert('Fill date/scores');
  const manual=loadManual(cur);
  const newKey=fixtureKey(home,away,date);
  if(oldKey && oldKey!==newKey){
    const i=manual.findIndex(x=>fixtureKey(x.team1||x.home,x.team2||x.away,x.date)===oldKey);
    if(i!==-1) manual.splice(i,1);
    const d=loadDeleted(cur); if(d.has(oldKey)){ d.delete(oldKey); saveDeleted(cur,d); }
  }
  const idx=manual.findIndex(x=>fixtureKey(x.team1||x.home,x.team2||x.away,x.date)===newKey);
  const rec={team1:home,team2:away,date,round,score:{ft:[hg,ag]},ft:[hg,ag],_manualId:newKey};
  if(idx!==-1) manual[idx]=rec; else manual.push(rec);
  const d2=loadDeleted(cur); if(d2.has(newKey)){ d2.delete(newKey); saveDeleted(cur,d2); }
  saveManual(cur,manual); dialog.close(); refresh(); writeUrl();
}
async function copyShareLink(){
  const cur=seasonA.value;
  let manual=loadManual(cur);
  const urlState=readUrlState();
  if(urlState.m && manual.length===0) manual=decodeManual(urlState.m);
  const enc=encodeManual(manual);
  const url=new URL(location.href);
  if(enc){ if(enc.length>1800) return alert('Too large — Export instead'); url.searchParams.set('m',enc);} else url.searchParams.delete('m');
  url.searchParams.set('a',seasonA.value); url.searchParams.set('b',seasonB.value); url.searchParams.set('team',currentTeam);
  url.searchParams.delete('season');
  try{ await navigator.clipboard.writeText(url.toString()); shareBtn.textContent='Copied'; setTimeout(()=>shareBtn.textContent='Share',1200);}catch{ prompt('Copy:',url.toString()); }
}
function exportJson(){
  const cur=seasonA.value; const manual=loadManual(cur);
  const blob=new Blob([JSON.stringify(manual,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`manual-${cur}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function importJson(e){
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{ const arr=JSON.parse(r.result); if(!Array.isArray(arr)) throw new Error('array'); const cur=seasonA.value; saveManual(cur,arr); refresh(); writeUrl(); alert(`Imported ${arr.length}`);}catch(err){ alert('Import failed: '+err.message);} };
  r.readAsText(f); e.target.value='';
}
init();

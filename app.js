import { fetchSeason, fetchMapping, fetchManifest } from './js/fetch-data.js';
import { getFT, fixtureKey } from './js/normalize.js';
import { comparePerOpponent } from './js/compare.js';
import { mergeMatches } from './js/merge.js';
import { loadManual, saveManual } from './js/storage.js';
import { encodeManual, decodeManual, readUrlState, writeUrlState } from './js/url.js';
import { buildCumulative } from './js/cumulative.js';
import { renderCumulativeChart } from './js/chart.js';

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

function shortSeason(s){ return s.slice(2).replace('-','–'); }
function seasonsFromManifest(manifest){ return manifest?.seasons || ['2026-27','2025-26','2024-25','2023-24','2022-23']; }

function populateSeasonSelects(seasons, defA='2026-27', defB='2025-26'){
  for(const sel of [seasonA, seasonB]){ sel.innerHTML=''; for(const s of seasons){ const o=document.createElement('option'); o.value=s; o.textContent=s; sel.appendChild(o);} }
  const urlState=readUrlState();
  let a=urlState.a||defA, b=urlState.b||defB;
  if(urlState.season && !urlState.a){ a=urlState.season; const idx=seasons.indexOf(a); b=seasons[idx+1]||seasons[1]||defB; }
  if(seasons.includes(a)) seasonA.value=a; else seasonA.value=defA;
  if(seasons.includes(b)) seasonB.value=b; else seasonB.value=defB;
  if(seasonA.value===seasonB.value){ const idx=seasons.indexOf(seasonA.value); seasonB.value=seasons[idx+1]||seasons.find(s=>s!==seasonA.value); }
}

async function init(){
  const manifest=await fetchManifest();
  const seasons=seasonsFromManifest(manifest);
  if(manifest) manifestHost.textContent=seasons.join(' · ');
  mapping=await fetchMapping();
  const newestFirst=[...seasons].reverse();
  populateSeasonSelects(newestFirst);
  await Promise.all(seasons.map(async s=>{
    try{ const raw=await fetchSeason(s); allSeasonsData[s]={raw,matches:raw.matches}; teamsBySeason[s]=[...new Set(raw.matches.flatMap(m=>[m.team1,m.team2]))].sort(); }catch(e){ console.warn('load',s,e)}
  }));
  const urlState=readUrlState();
  if(urlState.m){
    const shared=decodeManual(urlState.m);
    if(shared.length){
      bannerHost.innerHTML=`<div class="banner"><span>${shared.length} shared</span><span style="display:flex;gap:6px"><button id="applyShared" class="primary" style="padding:4px 8px;font-size:11px">Save</button><button id="dismissShared" style="padding:4px 8px;font-size:11px">Dismiss</button></span></div>`;
      document.getElementById('applyShared').onclick=()=>{
        const cur=seasonA.value; const existing=loadManual(cur);
        const map=new Map(existing.map(e=>[fixtureKey(e.team1||e.home,e.team2||e.away,e.date),e]));
        for(const s of shared) map.set(fixtureKey(s.team1||s.home,s.team2||s.away,s.date),s);
        saveManual(cur,[...map.values()]); bannerHost.innerHTML='';
        const p=new URLSearchParams(location.search); p.delete('m'); history.replaceState(null,'',location.pathname+(p.toString()?'?'+p.toString():''));
        refresh();
      };
      document.getElementById('dismissShared').onclick=()=>{
        const p=new URLSearchParams(location.search); p.delete('m'); history.replaceState(null,'',location.pathname+(p.toString()?'?'+p.toString():''));
        bannerHost.innerHTML=''; refresh();
      };
    }
  }
  const pendingTeam=urlState.team||'';
  updateTeamOptions(pendingTeam);
  currentTeam=teamSel.value;
  seasonA.addEventListener('change',()=>{
    if(seasonA.value===seasonB.value){ const seasons=[...seasonA.options].map(o=>o.value); const idx=seasons.indexOf(seasonA.value); seasonB.value=seasons[idx+1]||seasons.find(s=>s!==seasonA.value); }
    updateTeamOptions(); writeUrl(); refresh();
  });
  seasonB.addEventListener('change',()=>{
    if(seasonA.value===seasonB.value){ const seasons=[...seasonB.options].map(o=>o.value); const idx=seasons.indexOf(seasonB.value); seasonA.value=seasons[idx+1]||seasons.find(s=>s!==seasonA.value); updateTeamOptions(); }
    writeUrl(); refresh();
  });
  teamSel.addEventListener('change',()=>{ currentTeam=teamSel.value; writeUrl(); refresh(); });
  addBtn.addEventListener('click',()=>openDialog(null));
  shareBtn.addEventListener('click',copyShareLink);
  exportBtn.addEventListener('click',exportJson);
  importFile.addEventListener('change',importJson);
  document.getElementById('cancelBtn').addEventListener('click',()=>dialog.close());
  document.getElementById('editForm').addEventListener('submit',onSave);
  writeUrl(); refresh();
}

function updateTeamOptions(preferred){
  const teams=teamsBySeason[seasonA.value]||[];
  const prevVal=preferred||teamSel.value;
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
  let manual=[]; let deleted=loadDeleted(season);
  const isCurrent=season===seasonA.value;
  if(isCurrent){
    if(urlState.m){ const shared=decodeManual(urlState.m); if(shared.length) manual=shared; else manual=loadManual(season); }
    else manual=loadManual(season);
  }
  const norm=manual.map(m=>({team1:m.team1||m.home, team2:m.team2||m.away, date:m.date, round:m.round||'Manual', score:m.score||{ft:m.ft}, _manualId:m._manualId}));
  return mergeMatches(base, norm, deleted);
}

function writeUrl(){
  const manual=loadManual(seasonA.value);
  const urlState=readUrlState();
  const toEncode=urlState.m?decodeManual(urlState.m):manual;
  writeUrlState({team:currentTeam, a:seasonA.value, b:seasonB.value, manual:toEncode});
}

function refresh(){
  if(!teamSel.value) return;
  const cur=seasonA.value, prev=seasonB.value;
  // left → right chronological: older (prev) then newer (cur)
  document.getElementById('thHomeA').textContent=shortSeason(prev);
  document.getElementById('thHomeB').textContent=shortSeason(cur);
  document.getElementById('thAwayA').textContent=shortSeason(prev);
  document.getElementById('thAwayB').textContent=shortSeason(cur);
  const curMatches=getEffectiveMatches(cur);
  const prevMatches=getEffectiveMatches(prev);
  const key=`${prev}->${cur}`;
  const rev=`${cur}->${prev}`;
  let map=mapping[key]||{};
  if(!mapping[key] && mapping[rev]) map=Object.fromEntries(Object.entries(mapping[rev]).map(([k,v])=>[v,k]));
  const curTeams=teamsBySeason[cur]||[];
  const cmp=comparePerOpponent(teamSel.value, curMatches, prevMatches, map, curTeams);
  render(cmp, cur, prev);
  // chart: cumulative sorted by this season's game order
  const cum = buildCumulative(teamSel.value, curMatches, prevMatches, map, curTeams);
  const chartHost=document.getElementById('chartHost');
  const chartMeta=document.getElementById('chartMeta');
  if(chartHost){
    renderCumulativeChart(chartHost, cum.points, {maxY: cum.maxY, curLabel: cur, prevLabel: prev});
    const lastPlayed = [...cum.points].reverse().find(p=>p.isPlayed);
    const lastX = lastPlayed ? lastPlayed.x : 0;
    chartMeta.textContent = `${cum.points.length} gms · ${lastX} played · max ${cum.maxY} pts`;
  }
}

function wdlClass(pts){
  if(pts===3) return 'score-w';
  if(pts===1) return 'score-d';
  if(pts===0) return 'score-l';
  return '';
}
function fmtScore(ft, pts, isManual, isUnplayed){
  if(!ft) return `<span class="score muted">—</span>`;
  const s=`${ft[0]}–${ft[1]}`;
  return `<span class="score">${s}</span>${isManual?'<span class="badge manual">m</span>':''}`;
}
function deltaClass(d, isTotal){
  if(d===null||d===undefined) return 'zero';
  if(d===0) return 'zero';
  const m=Math.abs(d);
  const mag = m>=3?3: m===2?2:1;
  // total gets one step higher saturation where possible
  const eff = isTotal && mag<3 ? mag+1 : mag;
  return (d>0?'p':'n')+eff;
}
function fmtDelta(d, isTotal){
  if(d===null||d===undefined) return `<span class="delta zero">–</span>`;
  if(d===0) return `<span class="delta zero">0</span>`;
  const cls=deltaClass(d, isTotal);
  return `<span class="delta ${cls}">${d>0?`+${d}`:d}</span>`;
}

function render(cmp, curLabel, prevLabel){
  const {thisPts,lastPts,delta,comparable,proxyCount,rows}=cmp;
  // left → right chronological: older (prev) then newer (cur)
  kA.textContent=prevLabel; kB.textContent=curLabel;
  vThis.textContent=lastPts; vLast.textContent=thisPts;
  // keep delta as cur - prev, but vDelta stays as delta
  vDelta.textContent=(delta>0?'+':'')+delta;
  vDelta.className='v '+(delta>0?'pos':delta<0?'neg':'neu');
  kThis.textContent=`${lastPts} pts`;
  kLast.textContent=`${thisPts} pts`;
  kDelta.textContent=comparable?`${comparable} comp`+(proxyCount?` · ${proxyCount}p`:''):'';
  summaryNote.textContent=proxyCount?`${proxyCount}× proxy 1→18`:'';
  tableTitle.textContent=cmp.team.replace(' FC','').replace(' AFC','');
  tableMeta.textContent=`${rows.length} opps · ${comparable} comp`;

  tbody.innerHTML='';
  for(const r of rows){
    const oppShort=r.opp.replace(' FC','').replace(' AFC','').replace('Brighton & Hove Albion','Brighton');
    const proxBadge=r.isProxy?`<span class="badge proxy" title="${r.proxyOpp}→${r.opp}">p</span>`:'';
    const curHKey=r.curHome?r.curHome._key:`new|${cmp.team}|${r.opp}`;
    const curAKey=r.curAway?r.curAway._key:`new|${r.opp}|${cmp.team}`;
    const isRowPending = !r.ftCurH && !r.ftCurA;
    const prevHWdl = wdlClass(r.prevHomePts);
    const curHWdl = r.ftCurH ? wdlClass(r.curHomePts) : 'score-unplayed';
    const prevAWdl = wdlClass(r.prevAwayPts);
    const curAWdl = r.ftCurA ? wdlClass(r.curAwayPts) : 'score-unplayed';
    const tr=document.createElement('tr');
    if(isRowPending) tr.classList.add('row-pending');
    // older (prev) on left, newer (cur) on right — years left→right
    tr.innerHTML=`
      <td>${oppShort}${proxBadge}</td>
      <td class="sep ${r.ftPrevH?prevHWdl:''}">${fmtScore(r.ftPrevH, r.prevHomePts, false, false)}</td>
      <td class="score-cell ${curHWdl}" data-edit="${curHKey}">${fmtScore(r.ftCurH, r.curHomePts, r.curHome&&r.curHome._source==='manual', !r.ftCurH)}</td>
      <td>${fmtDelta(r.hDelta, false)}</td>
      <td class="sep ${r.ftPrevA?prevAWdl:''}">${fmtScore(r.ftPrevA, r.prevAwayPts, false, false)}</td>
      <td class="score-cell ${curAWdl}" data-edit="${curAKey}">${fmtScore(r.ftCurA, r.curAwayPts, r.curAway&&r.curAway._source==='manual', !r.ftCurA)}</td>
      <td>${fmtDelta(r.aDelta, false)}</td>
      <td class="sep">${fmtDelta(r.totalDelta, true)}</td>
    `;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('[data-edit]').forEach(cell=>{
    cell.style.cursor='pointer';
    cell.title='Tap to edit';
    cell.addEventListener('click',()=>{
      const key=cell.getAttribute('data-edit');
      if(key.startsWith('new|')){
        const [,home,away]=key.split('|');
        openDialog(null, home, away);
      } else {
        const ms=getEffectiveMatches(seasonA.value);
        const m=ms.find(x=>x._key===key);
        openDialog(m);
      }
    });
  });
}

function openDialog(existing, presetHome, presetAway){
  if(existing){
    fDate.value=existing.date||''; fHome.value=existing.team1; fAway.value=existing.team2;
    const ft=getFT(existing.score); fHg.value=ft?ft[0]:''; fAg.value=ft?ft[1]:''; fRound.value=existing.round||''; fKey.value=existing._key;
    document.getElementById('dialogTitle').textContent='Edit';
  } else {
    fDate.value=new Date().toISOString().slice(0,10);
    if(presetHome && presetAway){ fHome.value=presetHome; fAway.value=presetAway; }
    else { fHome.value=currentTeam; const teams=teamsBySeason[seasonA.value]||[]; fAway.value=teams.find(t=>t!==currentTeam)||teams[0]||''; }
    fHg.value=''; fAg.value=''; fRound.value='Manual'; fKey.value='';
    document.getElementById('dialogTitle').textContent='Add';
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
  const url=new URL(location.href);
  const enc=encodeManual(manual);
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

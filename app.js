import { fetchSeason, fetchMapping, fetchManifest } from './js/fetch-data.js';
import { getFT, fixtureKey, fixtureKeyTeam } from './js/normalize.js';
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
const vDelta = document.getElementById('vDelta');
const kThis = document.getElementById('kThis'), kLast = document.getElementById('kLast');
const tableTitle = document.getElementById('tableTitle');
const thead = document.getElementById('thead');
const toggleGroup = document.getElementById('toggleGroup');
const sortSchedule = document.getElementById('sortSchedule');
const sortName = document.getElementById('sortName');
const manifestHost = document.getElementById('manifestHost');
const manifestLine = document.getElementById('manifestLine');
const shareBtn = document.getElementById('shareBtn');
const addBtn = document.getElementById('addBtn');
const exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');
const dialog = document.getElementById('editDialog');
const fGameNumber = document.getElementById('fGameNumber'), fHome = document.getElementById('fHome'), fAway = document.getElementById('fAway'), fHg = document.getElementById('fHg'), fAg = document.getElementById('fAg'), fRound = document.getElementById('fRound'), fKey = document.getElementById('fKey');
const fixtureLine = document.getElementById('fixtureLine');
const homeName = document.getElementById('homeName'), awayName = document.getElementById('awayName');
const heroWord = document.getElementById('heroWord');
const cardList = document.getElementById('cardList');
const proxyLegend = document.getElementById('proxyLegend');
const chartBtnDelta = document.getElementById('chartBtnDelta');
const chartBtnDual = document.getElementById('chartBtnDual');

let allSeasonsData = {};
let mapping = {};
let allSeasons = [];
let teamsBySeason = {};
let currentTeam = '';
let grouped = false;
try { grouped = localStorage.getItem('epl-grouped') === '1'; } catch {}
let sortMode = 'schedule';
try { sortMode = localStorage.getItem('epl-sort') || 'schedule'; } catch {}
if (sortMode !== 'name') sortMode = 'schedule';
let chartMode = 'delta';
try { chartMode = localStorage.getItem('epl-chartMode') || 'delta'; } catch {}
let lastCum = null;
let lastCmp = null;
let lastLabels = {cur:'',prev:''};

function loadDeleted(season){ try{return new Set(JSON.parse(localStorage.getItem('epl-deleted-'+season)||'[]'))}catch{return new Set()} }
function saveDeleted(season,set){ localStorage.setItem('epl-deleted-'+season, JSON.stringify([...set])) }

function seasonsFromManifest(manifest){ return manifest?.seasons || ['2026-27','2025-26','2024-25','2023-24','2022-23']; }
function shortSeason(s){ return s ? s.slice(2).replace('-','–') : ''; }
function oppShort(name){ return name.replace(' FC','').replace(' AFC','').replace('Brighton & Hove Albion','Brighton'); }

function fillSeasonB(exclude, preferred){
  const prevVal = preferred ?? seasonB.value;
  seasonB.innerHTML='';
  for(const s of allSeasons){
    if(s===exclude) continue;
    const o=document.createElement('option'); o.value=s; o.textContent=s; seasonB.appendChild(o);
  }
  const vals=[...seasonB.options].map(o=>o.value);
  if(prevVal && prevVal!==exclude && vals.includes(prevVal)) seasonB.value=prevVal;
  else if(vals.length) seasonB.value=vals[0];
}

function populateSeasonSelects(seasons, defA='2026-27', defB='2025-26'){
  allSeasons=[...seasons];
  seasonA.innerHTML='';
  for(const s of seasons){ const o=document.createElement('option'); o.value=s; o.textContent=s; seasonA.appendChild(o); }
  const urlState=readUrlState();
  let a=urlState.a||defA, b=urlState.b||defB;
  if(urlState.season && !urlState.a){ a=urlState.season; const idx=seasons.indexOf(a); b=seasons[idx+1]||seasons[1]||defB; }
  if(seasons.includes(a)) seasonA.value=a; else seasonA.value=defA;
  if(b===seasonA.value) b=defB===seasonA.value?seasons.find(s=>s!==seasonA.value):defB;
  fillSeasonB(seasonA.value, seasons.includes(b)?b:defB);
}

async function init(){
  const manifest=await fetchManifest();
  const seasons=seasonsFromManifest(manifest);
  if(manifest) { manifestHost.textContent=seasons.join(' · '); if(manifestLine) manifestLine.textContent=`Seasons: ${seasons.join(' · ')} · generated ${new Date(manifest.generatedAt).toLocaleDateString()}`; }
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
      // shared fixtures apply directly (no toast): merge into local, shared wins per fixture
      const cur=seasonA.value; const existing=loadManual(cur);
      const map=new Map(existing.map(e=>[fixtureKeyTeam(e.team1||e.home,e.team2||e.away),e]));
      for(const s of shared) map.set(fixtureKeyTeam(s.team1||s.home,s.team2||s.away),s);
      saveManual(cur,[...map.values()]);
    }
    const p=new URLSearchParams(location.search); p.delete('m'); history.replaceState(null,'',location.pathname+(p.toString()?'?'+p.toString():''));
  }
  const pendingTeam=urlState.team||'';
  updateTeamOptions(pendingTeam);
  currentTeam=teamSel.value;
  seasonA.addEventListener('change',()=>{
    fillSeasonB(seasonA.value, seasonB.value);
    updateTeamOptions(); writeUrl(); refresh();
  });
  seasonB.addEventListener('change',()=>{
    writeUrl(); refresh();
  });
  teamSel.addEventListener('change',()=>{ currentTeam=teamSel.value; writeUrl(); refresh(); });
  if (addBtn) addBtn.addEventListener('click',()=>openDialog(null));
  if (shareBtn) shareBtn.addEventListener('click',copyShareLink);
  if (exportBtn) exportBtn.addEventListener('click',exportJson);
  if (importFile) importFile.addEventListener('change',importJson);
  const cancelBtn=document.getElementById('cancelBtn');
  if(cancelBtn) cancelBtn.addEventListener('click',()=>dialog.close());
  const cancelBtn2=document.getElementById('cancelBtn2');
  if(cancelBtn2) cancelBtn2.addEventListener('click',()=>dialog.close());
  document.getElementById('editForm').addEventListener('submit',onSave);
  if (toggleGroup) toggleGroup.addEventListener('click',()=>{
    grouped = !grouped;
    try { localStorage.setItem('epl-grouped', grouped ? '1' : '0'); } catch {}
    refresh();
  });
  if(chartBtnDelta) chartBtnDelta.addEventListener('click',()=> setChartMode('delta'));
  if(chartBtnDual) chartBtnDual.addEventListener('click',()=> setChartMode('dual'));
  if(sortSchedule) sortSchedule.addEventListener('click',()=> setSortMode('schedule'));
  if(sortName) sortName.addEventListener('click',()=> setSortMode('name'));
  // apply persisted chart mode + sort order
  syncChartToggle();
  syncSortToggle();
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
  const norm=manual.map(m=>({
    team1:m.team1||m.home,
    team2:m.team2||m.away,
    gameNumber: m.gameNumber ?? m.game_number ?? m.gw ?? null,
    date: m.date || null,
    round: m.round || (m.gameNumber ? `Game ${m.gameNumber}` : 'Manual'),
    score:m.score||{ft:m.ft},
    _manualId:m._manualId
  }));
  return mergeMatches(base, norm, deleted);
}

function writeUrl(){
  const manual=loadManual(seasonA.value);
  const urlState=readUrlState();
  const toEncode=urlState.m?decodeManual(urlState.m):manual;
  writeUrlState({team:currentTeam, a:seasonA.value, b:seasonB.value, manual:toEncode});
}

function setChartMode(m){
  chartMode=m;
  try{ localStorage.setItem('epl-chartMode', m);}catch{}
  syncChartToggle();
  if(lastCum){
    const chartHost=document.getElementById('chartHost');
    if(chartHost) renderCumulativeChart(chartHost, lastCum.points, {maxY: lastCum.maxY, curLabel: lastLabels.cur, prevLabel: lastLabels.prev, mode: chartMode});
  }
}
function syncChartToggle(){
  if(!chartBtnDelta||!chartBtnDual) return;
  chartBtnDelta.classList.toggle('active', chartMode==='delta');
  chartBtnDelta.setAttribute('aria-selected', chartMode==='delta');
  chartBtnDual.classList.toggle('active', chartMode==='dual');
  chartBtnDual.setAttribute('aria-selected', chartMode==='dual');
}
function setSortMode(m){
  sortMode=m;
  try{ localStorage.setItem('epl-sort', m);}catch{}
  syncSortToggle();
  refresh();
}
function syncSortToggle(){
  if(!sortSchedule||!sortName) return;
  const byName=sortMode==='name';
  sortSchedule.classList.toggle('active', !byName);
  sortSchedule.setAttribute('aria-selected', !byName);
  sortName.classList.toggle('active', byName);
  sortName.setAttribute('aria-selected', byName);
}
function refresh(){
  if(!teamSel.value) return;
  const cur=seasonA.value, prev=seasonB.value;
  const curMatches=getEffectiveMatches(cur);
  const prevMatches=getEffectiveMatches(prev);
  const key=`${prev}->${cur}`;
  const rev=`${cur}->${prev}`;
  let map=mapping[key]||{};
  if(!mapping[key] && mapping[rev]) map=Object.fromEntries(Object.entries(mapping[rev]).map(([k,v])=>[v,k]));
  const curTeams=teamsBySeason[cur]||[];
  const cmp=comparePerOpponent(teamSel.value, curMatches, prevMatches, map, curTeams);
  // schedule order from this season's fixture list (game number per opponent+venue)
  const cum = buildCumulative(teamSel.value, curMatches, prevMatches, map, curTeams);
  lastCum=cum; lastCmp=cmp; lastLabels={cur,prev};
  const order=new Map();
  for(const p of cum.points) order.set(`${p.opp}|${p.venue}`.toLowerCase(), p.x);
  render(cmp, cur, prev, order);
  // chart: cumulative sorted by this season's game order
  const chartHost=document.getElementById('chartHost');
  if(chartHost){
    renderCumulativeChart(chartHost, cum.points, {maxY: cum.maxY, curLabel: cur, prevLabel: prev, mode: chartMode});
  }
}

function wdlClass(pts){
  return '';
}
function wdlDot(pts){
  if(pts==null) return '';
  const c=pts===3?'w':pts===1?'d':'l';
  const t=pts===3?'win':pts===1?'draw':'loss';
  return `<span class="wdl ${c}" title="${t}"></span>`;
}
function fmtScore(ft, pts, isManual, isUnplayed){
  if(!ft) return `<span class="score muted">—</span>`;
  const s=`${ft[0]}–${ft[1]}`;
  return `${isManual?'<span class="badge manual">m</span>':''}${wdlDot(pts)}<span class="score">${s}</span>`;
}
function proxyTitleAttr(oppFull, proxyFull, prevLabel){
  return ` title="${oppShort(oppFull)} promoted — showing ${oppShort(proxyFull)}'s ${prevLabel} fixtures"`;
}
function fmtScorePlain(ft){
  if(!ft) return `<span class="score muted">—</span>`;
  return `<span class="score">${ft[0]}–${ft[1]}</span>`;
}
function deltaClass(d, isTotal){
  if(d===null||d===undefined) return 'zero';
  if(d===0) return 'zero';
  const m=Math.abs(d);
  const mag = m>=3?3: m===2?2:1;
  const eff = isTotal && mag<3 ? mag+1 : mag;
  return (d>0?'p':'n')+eff;
}
function fmtDeltaVenue(d, curPts, prevPts){
  if(d===null||d===undefined) return `<span class="delta zero">–</span>`;
  if(d===0){
    const isMax = curPts===3 && prevPts===3;
    return `<span class="delta ${isMax?'zero-max':'zero'}">0</span>`;
  }
  const cls=deltaClass(d,false);
  return `<span class="delta ${cls}">${d>0?`+${d}`:d}</span>`;
}
function fmtDeltaTotal(d, row){
  if(d===null||d===undefined) return `<span class="delta zero">–</span>`;
  if(d===0){
    const homePlayed = row.ftCurH !== null;
    const awayPlayed = row.ftCurA !== null;
    const homeMax = row.curHomePts===3 && row.prevHomePts===3;
    const awayMax = row.curAwayPts===3 && row.prevAwayPts===3;
    let isMax = false;
    if (homePlayed && awayPlayed) isMax = homeMax && awayMax;
    else if (homePlayed && !awayPlayed) isMax = homeMax;
    else if (!homePlayed && awayPlayed) isMax = awayMax;
    else isMax = false;
    return `<span class="delta ${isMax?'zero-max':'zero'}">0</span>`;
  }
  const cls=deltaClass(d,true);
  return `<span class="delta ${cls}">${d>0?`+${d}`:d}</span>`;
}

function heroWordFor(delta){
  if(delta>0) return 'ahead';
  if(delta<0) return 'behind';
  return 'level';
}
function render(cmp, curLabel, prevLabel, order){
  const {thisPts,lastPts,delta,comparable,proxyCount,rows}=cmp;
  // Hero: 3 lines only, said once
  const sign = delta>0?`+${delta}`:String(delta);
  vDelta.textContent=sign;
  vDelta.className='hero-delta '+(delta>0?'pos':delta<0?'neg':'neu');
  if(heroWord) heroWord.textContent = `${heroWordFor(delta)} vs last season`;
  if(kLast) kLast.textContent=`These fixtures last season: ${lastPts} pts`;
  if(kThis) kThis.textContent=`This season: ${thisPts} pts`;
  if(tableTitle) tableTitle.textContent=cmp.team.replace(' FC','').replace(' AFC','');
  // proxy legend
  if(proxyLegend){
    if(proxyCount>0){
      const key = `${prevLabel}→${curLabel}`;
      const m = mapping[key] || {};
      const pairs = Object.entries(m).map(([prom,rel])=> `${prom.replace(' FC','')} → ${rel.replace(' FC','')}`).join(' · ');
      proxyLegend.textContent = pairs ? `* Promoted mapped: ${pairs}` : `* ${proxyCount} promoted opponent${proxyCount>1?'s':''} mapped`;
    } else proxyLegend.textContent='';
  }
  // tidy dataset: one row per opponent per venue (older season left)
  const tidy=[];
  for(const r of rows){
    const oS=oppShort(r.opp);
    const prox=r.isProxy?r.proxyOpp:null;
    tidy.push({opp:r.opp,oppShort:oS,isProxy:r.isProxy,proxyOpp:prox,venue:'H',
      ftPrev:r.ftPrevH,ftCur:r.ftCurH,curPts:r.curHomePts,prevPts:r.prevHomePts,delta:r.hDelta,
      curMatch:r.curHome,key:r.curHome?r.curHome._key:`new|${cmp.team}|${r.opp}`});
    tidy.push({opp:r.opp,oppShort:oS,isProxy:r.isProxy,proxyOpp:prox,venue:'A',
      ftPrev:r.ftPrevA,ftCur:r.ftCurA,curPts:r.curAwayPts,prevPts:r.prevAwayPts,delta:r.aDelta,
      curMatch:r.curAway,key:r.curAway?r.curAway._key:`new|${r.opp}|${cmp.team}`});
  }
  // order: this season's schedule (game number), or alphabetical by team name
  const sRows=[...rows];
  if(sortMode!=='name'){
    const ordV=(opp,venue)=> order?.get(`${opp}|${venue}`.toLowerCase()) ?? 999;
    tidy.sort((a,b)=> (ordV(a.opp,a.venue)-ordV(b.opp,b.venue)) || a.opp.localeCompare(b.opp) || (a.venue<b.venue?-1:1));
    const gOrd=(r)=> Math.min(ordV(r.opp,'H'), ordV(r.opp,'A'));
    sRows.sort((a,b)=> (gOrd(a)-gOrd(b)) || a.opp.localeCompare(b.opp));
  }
  if (toggleGroup) {
    toggleGroup.textContent = grouped ? 'Split Home & Away' : 'Group Home & Away';
    toggleGroup.classList.toggle('active', grouped);
    toggleGroup.setAttribute('aria-pressed', grouped);
  }
  // thead per mode (older season always left)
  if(thead){
    if(grouped){
      const pS=shortSeason(prevLabel), cS=shortSeason(curLabel);
      thead.innerHTML=`<tr><th rowspan="2" style="text-align:left">Opponent</th><th colspan="3" style="text-align:center">Home</th><th colspan="3" style="text-align:center">Away</th><th rowspan="2">+/-</th></tr>`+
        `<tr><th class="num grp">${pS}</th><th class="num">${cS}</th><th class="num">+/-</th><th class="num grp">${pS}</th><th class="num">${cS}</th><th class="num">+/-</th></tr>`;
    } else {
      thead.innerHTML=`<tr><th style="text-align:left">Opponent</th><th style="text-align:center">H/A</th><th class="num">${shortSeason(prevLabel)}</th><th class="num">${shortSeason(curLabel)}</th><th class="num">+/-</th></tr>`;
    }
  }

  // Cards (mobile) — tidy rows by default, grouped cards when toggled
  if(cardList){
    cardList.innerHTML='';
    if(grouped){
      for(const r of sRows){
        const isPending = !r.ftCurH && !r.ftCurA;
        const oS=oppShort(r.opp);
        const curHKey=r.curHome?r.curHome._key:`new|${cmp.team}|${r.opp}`;
        const curAKey=r.curAway?r.curAway._key:`new|${r.opp}|${cmp.team}`;
        const hCur = fmtScore(r.ftCurH, r.curHomePts, r.curHome&&r.curHome._source==='manual');
        const hPrev = `${wdlDot(r.prevHomePts)}${fmtScorePlain(r.ftPrevH)}`;
        const aCur = fmtScore(r.ftCurA, r.curAwayPts, r.curAway&&r.curAway._source==='manual');
        const aPrev = `${wdlDot(r.prevAwayPts)}${fmtScorePlain(r.ftPrevA)}`;
        const card=document.createElement('div');
        card.className='opp-card'+(isPending?' pending':'');
        card.innerHTML=`
          <div class="opp-top">
            <div class="opp-name"${r.isProxy?proxyTitleAttr(r.opp,r.proxyOpp,prevLabel):''}>${oS}</div>
            <div class="total-delta">${fmtDeltaTotal(r.totalDelta, r)}</div>
          </div>
          <div class="opp-grid">
            <div class="venue-box">
              <div class="venue-label"><span>Home</span>${fmtDeltaVenue(r.hDelta, r.curHomePts, r.prevHomePts)}</div>
              <div class="venue-scores">
                <span>${hPrev}</span>
                <span style="font-size:11px;color:var(--mut)">→</span>
                <span class="score-cell" data-edit="${curHKey}">${hCur}</span>
              </div>
            </div>
            <div class="venue-box">
              <div class="venue-label"><span>Away</span>${fmtDeltaVenue(r.aDelta, r.curAwayPts, r.prevAwayPts)}</div>
              <div class="venue-scores">
                <span>${aPrev}</span>
                <span style="font-size:11px;color:var(--mut)">→</span>
                <span class="score-cell" data-edit="${curAKey}">${aCur}</span>
              </div>
            </div>
          </div>
        `;
        cardList.appendChild(card);
      }
    } else {
      for(const f of tidy){
        const row=document.createElement('div');
        row.className='tidy-row'+(!f.ftCur?' pending':'');
        row.innerHTML=`
          <span class="tidy-opp"${f.isProxy?proxyTitleAttr(f.opp,f.proxyOpp,prevLabel):''}>${f.oppShort}<span class="venue-tag">${f.venue}</span></span>
          <span class="tidy-prev">${wdlDot(f.prevPts)}${fmtScorePlain(f.ftPrev)}</span>
          <span class="tidy-arrow">→</span>
          <span class="score-cell tidy-cur" data-edit="${f.key}">${fmtScore(f.ftCur, f.curPts, f.curMatch&&f.curMatch._source==='manual')}</span>
          <span class="tidy-delta">${fmtDeltaVenue(f.delta, f.curPts, f.prevPts)}</span>
        `;
        cardList.appendChild(row);
      }
    }
    if(cardList.children.length===0){
      const d=document.createElement('div');
      d.style.cssText='text-align:center;padding:14px;color:var(--mut);font-size:13px';
      d.textContent='No fixtures found for this team.';
      cardList.appendChild(d);
    }
  }

  // Table (desktop) — tidy rows by default, grouped when toggled; older season left
  tbody.innerHTML='';
  if(grouped){
    for(const r of sRows){
      const isRowPending = !r.ftCurH && !r.ftCurA;
      const oS=oppShort(r.opp);
      const curHKey=r.curHome?r.curHome._key:`new|${cmp.team}|${r.opp}`;
      const curAKey=r.curAway?r.curAway._key:`new|${r.opp}|${cmp.team}`;
      const tr=document.createElement('tr');
      if(isRowPending) tr.classList.add('row-pending');
      tr.innerHTML=`
        <td${r.isProxy?proxyTitleAttr(r.opp,r.proxyOpp,prevLabel):''}>${oS}</td>
        <td class="num grp">${wdlDot(r.prevHomePts)}${fmtScorePlain(r.ftPrevH)}</td>
        <td class="num"><span class="score-cell" data-edit="${curHKey}">${fmtScore(r.ftCurH, r.curHomePts, r.curHome&&r.curHome._source==='manual')}</span></td>
        <td class="num">${fmtDeltaVenue(r.hDelta, r.curHomePts, r.prevHomePts)}</td>
        <td class="num grp">${wdlDot(r.prevAwayPts)}${fmtScorePlain(r.ftPrevA)}</td>
        <td class="num"><span class="score-cell" data-edit="${curAKey}">${fmtScore(r.ftCurA, r.curAwayPts, r.curAway&&r.curAway._source==='manual')}</span></td>
        <td class="num">${fmtDeltaVenue(r.aDelta, r.curAwayPts, r.prevAwayPts)}</td>
        <td class="num grp">${fmtDeltaTotal(r.totalDelta, r)}</td>
      `;
      tbody.appendChild(tr);
    }
  } else {
    for(const f of tidy){
      const tr=document.createElement('tr');
      if(!f.ftCur) tr.classList.add('row-pending');
      tr.innerHTML=`
        <td${f.isProxy?proxyTitleAttr(f.opp,f.proxyOpp,prevLabel):''}>${f.oppShort}</td>
        <td class="venue-cell">${f.venue}</td>
        <td class="num">${wdlDot(f.prevPts)}${fmtScorePlain(f.ftPrev)}</td>
        <td class="num"><span class="score-cell" data-edit="${f.key}">${fmtScore(f.ftCur, f.curPts, f.curMatch&&f.curMatch._source==='manual')}</span></td>
        <td class="num">${fmtDeltaVenue(f.delta, f.curPts, f.prevPts)}</td>
      `;
      tbody.appendChild(tr);
    }
  }
  if (tbody.children.length === 0) {
    const tr=document.createElement('tr');
    tr.innerHTML=`<td colspan="${grouped?8:5}" style="text-align:center;padding:14px;color:var(--mut)">No fixtures found for this team</td>`;
    tbody.appendChild(tr);
  }
  // bind edit handlers for both cards and table
  document.querySelectorAll('[data-edit]').forEach(cell=>{
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

function getNextGameNumber(){
  const curMatches=getEffectiveMatches(seasonA.value);
  const teamRows=curMatches.filter(m=>m.team1===currentTeam||m.team2===currentTeam);
  // find max gameNumber among played, or count
  let maxPlayed = 0;
  for(const m of teamRows){
    const ft=getFT(m.score);
    if(ft){
      const gn = m.gameNumber ?? 0;
      if(gn>maxPlayed) maxPlayed=gn;
    }
  }
  // if no gameNumber on official (they use date), use count of played as proxy
  if(maxPlayed===0){
    const playedCount = teamRows.filter(m=>getFT(m.score)).length;
    return Math.min(38, playedCount+1);
  }
  return Math.min(38, maxPlayed+1);
}
function openDialog(existing, presetHome, presetAway, presetGameNumber){
  if(existing){
    // existing has gameNumber or derive from team rows order
    let gn = existing.gameNumber;
    if(gn==null){
      // derive from team's chronological order
      const curMatches=getEffectiveMatches(seasonA.value);
      const rows=curMatches.filter(m=>m.team1===currentTeam||m.team2===currentTeam).slice().sort((a,b)=>(a.gameNumber??999)-(b.gameNumber??999) || (a.date||'').localeCompare(b.date||''));
      const idx=rows.findIndex(r=> r._key===existing._key || (r.team1===existing.team1 && r.team2===existing.team2));
      gn = idx>=0 ? idx+1 : getNextGameNumber();
    }
    fGameNumber.value= gn ?? '';
    fHome.value=existing.team1; fAway.value=existing.team2;
    const ft=getFT(existing.score); fHg.value=ft?ft[0]:''; fAg.value=ft?ft[1]:''; fRound.value=existing.round||''; fKey.value=existing._key;
    document.getElementById('dialogTitle').textContent='Edit';
  } else {
    let gn = presetGameNumber;
    if(gn==null){
      if(presetHome && presetAway){
        // try to find official fixture's gameNumber for that pair
        const curMatches=getEffectiveMatches(seasonA.value);
        const official = curMatches.find(m=> m.team1===presetHome && m.team2===presetAway) || curMatches.find(m=> m.team1===presetAway && m.team2===presetHome);
        if(official && official.gameNumber) gn = official.gameNumber;
        else {
          // fallback: find in base data
          const base = allSeasonsData[seasonA.value]?.matches||[];
          const teamRows=base.filter(m=> (m.team1===presetHome&&m.team2===presetAway)||(m.team1===presetAway&&m.team2===presetHome));
          if(teamRows[0]){
            // derive from date order
            const allTeamRows=base.filter(m=>m.team1===currentTeam||m.team2===currentTeam).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
            const idx=allTeamRows.findIndex(r=> (r.team1===presetHome&&r.team2===presetAway)||(r.team1===presetAway&&r.team2===presetHome));
            gn = idx>=0 ? idx+1 : getNextGameNumber();
          } else gn = getNextGameNumber();
        }
      } else gn = getNextGameNumber();
    }
    fGameNumber.value= gn ?? '';
    if(presetHome && presetAway){ fHome.value=presetHome; fAway.value=presetAway; }
    else { fHome.value=currentTeam; const teams=teamsBySeason[seasonA.value]||[]; fAway.value=teams.find(t=>t!==currentTeam)||teams[0]||''; }
    fHg.value=''; fAg.value=''; fRound.value=''; fKey.value='';
    document.getElementById('dialogTitle').textContent='Add';
  }
  const hN=fHome.value, aN=fAway.value;
  if(fixtureLine) fixtureLine.textContent=`Game ${fGameNumber.value} · ${oppShort(hN)} vs ${oppShort(aN)}`;
  if(homeName) homeName.textContent=`${oppShort(hN)} (H)`;
  if(awayName) awayName.textContent=`${oppShort(aN)} (A)`;
  dialog.showModal();
}
function onSave(e){
  e.preventDefault();
  const cur=seasonA.value;
  const home=fHome.value, away=fAway.value, oldKey=fKey.value;
  const gnRaw=fGameNumber.value.trim(), hgRaw=fHg.value.trim(), agRaw=fAg.value.trim();
  if(home===away) return alert('Home ≠ Away');
  if(gnRaw===''||hgRaw===''||agRaw==='') return alert('Fill game number (1-38) and scores');
  const gameNumber=Number(gnRaw), hg=Number(hgRaw), ag=Number(agRaw);
  if(!gameNumber||isNaN(hg)||isNaN(ag)||gameNumber<1||gameNumber>38) return alert('Fill game number (1-38) and scores');
  const manual=loadManual(cur);
  const newKey=fixtureKeyTeam(home,away);
  // handle legacy date-based keys stored previously
  if(oldKey && oldKey!==newKey){
    // try team key first, fallback to legacy date-based
    let i=manual.findIndex(x=>fixtureKeyTeam(x.team1||x.home,x.team2||x.away)===oldKey);
    if(i===-1) i=manual.findIndex(x=>fixtureKey(x.team1||x.home,x.team2||x.away,x.date)===oldKey);
    if(i!==-1) manual.splice(i,1);
    const d=loadDeleted(cur); if(d.has(oldKey)){ d.delete(oldKey); saveDeleted(cur,d); }
  }
  let idx=manual.findIndex(x=>fixtureKeyTeam(x.team1||x.home,x.team2||x.away)===newKey);
  const rec={team1:home,team2:away,gameNumber,round:`Game ${gameNumber}`,score:{ft:[hg,ag]},ft:[hg,ag],_manualId:newKey};
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
  try{ await navigator.clipboard.writeText(url.toString()); const orig=shareBtn.textContent; shareBtn.textContent='copied'; setTimeout(()=>shareBtn.textContent=orig,1200);}catch{ prompt('Copy:',url.toString()); }
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

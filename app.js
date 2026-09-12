import { fetchSeason, fetchMapping, fetchManifest } from './js/fetch-data.js';
import { getFT, fixtureKey, pointsForTeam } from './js/normalize.js';
import { compareTeam } from './js/compare.js';
import { mergeMatches } from './js/merge.js';
import { loadManual, saveManual } from './js/storage.js';
import { encodeManual, decodeManual, readUrlState, writeUrlState } from './js/url.js';

const seasonSel = document.getElementById('seasonSel');
const teamSel = document.getElementById('teamSel');
const tbody = document.getElementById('tbody');
const vThis = document.getElementById('vThis'), vLast = document.getElementById('vLast'), vDelta = document.getElementById('vDelta');
const kThis = document.getElementById('kThis'), kLast = document.getElementById('kLast'), kDelta = document.getElementById('kDelta');
const summaryNote = document.getElementById('summaryNote');
const tableTitle = document.getElementById('tableTitle'), tableMeta = document.getElementById('tableMeta');
const bannerHost = document.getElementById('bannerHost');
const validationHost = document.getElementById('validationHost');
const manifestHost = document.getElementById('manifestHost');
const addBtn = document.getElementById('addBtn'), shareBtn = document.getElementById('shareBtn'), exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');
const dialog = document.getElementById('editDialog');
const fDate = document.getElementById('fDate'), fHome = document.getElementById('fHome'), fAway = document.getElementById('fAway'), fHg = document.getElementById('fHg'), fAg = document.getElementById('fAg'), fRound = document.getElementById('fRound'), fKey = document.getElementById('fKey');

let currentSeason = '', lastSeason = '';
let allSeasonsData = {}; // season -> {matches, raw}
let mapping = {};
let teamsBySeason = {};
let currentTeam = '';
let isH2h = false;

// deleted keys per season
function loadDeleted(season) {
  try { return new Set(JSON.parse(localStorage.getItem('epl-deleted-'+season) || '[]')); } catch { return new Set(); }
}
function saveDeleted(season, set) { localStorage.setItem('epl-deleted-'+season, JSON.stringify([...set])); }

function parseSeasonPair(val) { const [cur, prev] = val.split('|'); return {cur, prev}; }

async function init() {
  const urlState = readUrlState();
  if (urlState.season) {
    // find option
    for (const opt of seasonSel.options) if (opt.value.startsWith(urlState.season+'|') || opt.value===urlState.season) seasonSel.value = opt.value;
  }
  // default team from URL
  const pendingTeam = urlState.team || '';

  // Fetch manifest + mapping early
  const manifest = await fetchManifest();
  if (manifest) manifestHost.textContent = `Data synced ${manifest.generatedAt?.slice(0,10) || ''} — seasons ${manifest.seasons.join(', ')}`;

  mapping = await fetchMapping();
  // also show validation-report if any
  try {
    const vrRes = await fetch('public/data/validation-report.json');
    if (vrRes.ok) {
      const vr = await vrRes.json();
      if (vr.validation.warnings.length || vr.validation.unmatchedTeams.length) {
        validationHost.innerHTML = `Validation: ${vr.validation.warnings.length} warnings` + (vr.validation.unmatchedTeams.length? `, unmatched: ${vr.validation.unmatchedTeams.join(', ')}`:'') + ` — see <code>public/data/validation-report.json</code>`;
        validationHost.style.color = '#92400e';
      } else {
        validationHost.textContent = 'Validation: OK — no unmatched teams.';
      }
    }
  } catch {}

  // Load all seasons in parallel
  const seasonsToLoad = new Set();
  for (const opt of seasonSel.options) {
    const {cur, prev} = parseSeasonPair(opt.value);
    seasonsToLoad.add(cur); seasonsToLoad.add(prev);
  }
  await Promise.all([...seasonsToLoad].map(async s => {
    try {
      const raw = await fetchSeason(s);
      allSeasonsData[s] = { raw, matches: raw.matches };
      const teams = [...new Set(raw.matches.flatMap(m=>[m.team1,m.team2]))].sort();
      teamsBySeason[s] = teams;
    } catch (e) { console.warn('load season failed', s, e); }
  }));

  // Banner for shared manual
  if (urlState.m) {
    const shared = decodeManual(urlState.m);
    if (shared.length) {
      const {cur} = parseSeasonPair(seasonSel.value);
      bannerHost.innerHTML = `<div class="banner"><span>Viewing <strong>${shared.length} shared manual result(s)</strong> from URL. They are not yet saved to this device. <code>?m=</code> overrides local.</span><span style="display:flex; gap:0.5rem;"><button id="applyShared" class="primary small">Save to device</button><button id="dismissShared" class="small">Dismiss</button></span></div>`;
      document.getElementById('applyShared').onclick = () => {
        const curSeason = parseSeasonPair(seasonSel.value).cur;
        const existing = loadManual(curSeason);
        // Merge shared into local (append, dedup by key)
        const map = new Map(existing.map(e=>[fixtureKey(e.team1||e.home, e.team2||e.away, e.date), e]));
        for (const s of shared) {
          const home = s.team1||s.home, away = s.team2||s.away;
          map.set(fixtureKey(home,away,s.date), s);
        }
        saveManual(curSeason, [...map.values()]);
        bannerHost.innerHTML = '';
        history.replaceState(null,'', location.pathname + location.search.replace(/([&?])m=[^&]*/,'').replace(/^&/,'?').replace(/\?$/,''));
        refresh();
      };
      document.getElementById('dismissShared').onclick = () => {
        const p = new URLSearchParams(location.search); p.delete('m'); history.replaceState(null,'', location.pathname + (p.toString()?'?'+p.toString():''));
        bannerHost.innerHTML=''; refresh();
      };
    }
  }

  seasonSel.addEventListener('change', () => { // reset team if not in new season
    updateTeamOptions();
    writeUrl();
    refresh();
  });
  teamSel.addEventListener('change', () => { currentTeam = teamSel.value; writeUrl(); refresh(); });

  addBtn.addEventListener('click', () => openDialog(null));
  shareBtn.addEventListener('click', copyShareLink);
  exportBtn.addEventListener('click', exportJson);
  importFile.addEventListener('change', importJson);
  document.getElementById('cancelBtn').addEventListener('click', ()=> dialog.close());
  document.getElementById('editForm').addEventListener('submit', onSave);

  // dialog close on backdrop? native

  updateTeamOptions(pendingTeam);
  currentTeam = teamSel.value;
  writeUrl();
  refresh();
}

function updateTeamOptions(preferred) {
  const {cur} = parseSeasonPair(seasonSel.value);
  const teams = teamsBySeason[cur] || [];
  teamSel.innerHTML = '';
  for (const t of teams) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t.replace(' FC','').replace(' AFC','');
    teamSel.appendChild(opt);
  }
  if (preferred && teams.includes(preferred)) teamSel.value = preferred;
  else if (teams.includes('Arsenal FC')) teamSel.value = 'Arsenal FC';
  else if (teams[0]) teamSel.value = teams[0];
  // also populate home/away selects
  fHome.innerHTML = ''; fAway.innerHTML='';
  for (const t of teams) {
    const o1 = document.createElement('option'); o1.value=t; o1.textContent=t.replace(' FC','');
    const o2 = o1.cloneNode(true);
    fHome.appendChild(o1); fAway.appendChild(o2);
  }
  currentTeam = teamSel.value;
}

function getEffectiveMatches(season) {
  const base = (allSeasonsData[season]?.matches) || [];
  const urlState = readUrlState();
  let manual = [];
  let deleted = loadDeleted(season);
  const isCurrent = season === parseSeasonPair(seasonSel.value).cur;
  if (isCurrent) {
    // shared URL overrides local for display; but for saving we handled banner. For render, use shared if present.
    if (urlState.m) {
      const shared = decodeManual(urlState.m);
      if (shared.length) manual = shared;
      else manual = loadManual(season);
    } else {
      manual = loadManual(season);
    }
  }
  // Manual entries are stored as {team1, team2, date, round, score:{ft:[]}} or {home,away,date,ft}
  // Normalize to shape expected by merge
  const normalizedManual = manual.map(m=> ({
    team1: m.team1 || m.home,
    team2: m.team2 || m.away,
    date: m.date,
    round: m.round || 'Manual',
    score: m.score || {ft: m.ft},
    _manualId: m._manualId,
  }));
  return mergeMatches(base, normalizedManual, deleted);
}

function writeUrl() {
  const {cur} = parseSeasonPair(seasonSel.value);
  const manual = loadManual(cur);
  // if there's a shared ?m= we keep it? writeUrlState will preserve unless we overwrite. For normal nav, we want to reflect local manual only if no shared? Simpler: if URL has ?m=, don't overwrite with local until user saves.
  const urlState = readUrlState();
  const toEncode = urlState.m ? decodeManual(urlState.m) : manual;
  writeUrlState({team: currentTeam, season: cur, manual: toEncode});
}

function refresh() {
  if (!teamSel.value) return;
  const {cur, prev} = parseSeasonPair(seasonSel.value);
  const curMatches = getEffectiveMatches(cur);
  const prevMatches = getEffectiveMatches(prev); // prev also may have manual? but we treat prev as official only (no manual needed) — use base
  // For prev, manual overrides should also be allowed but less common
  const mappingKey = `${prev}->${cur}`;
  const map = mapping[mappingKey] || {};
  const cmp = compareTeam(teamSel.value, curMatches, prevMatches, map);
  render(cmp, cur, prev);
}

function render(cmp, curSeasonLabel, prevSeasonLabel) {
  const {thisPts, lastPts, delta, comparable, proxyCount, rows} = cmp;
  vThis.textContent = thisPts;
  vLast.textContent = lastPts;
  vDelta.textContent = (delta>0?'+':'') + delta;
  vDelta.className = 'v ' + (delta>0?'pos':delta<0?'neg':'neu');
  kThis.textContent = `pts (${rows.filter(r=>r.isPlayed).length} played / ${rows.length} fixtures)`;
  kLast.textContent = `pts (${comparable} comparable of ${rows.filter(r=>r.isPlayed).length} played${proxyCount? `, ${proxyCount} via proxy`:''})`;
  kDelta.textContent = comparable? `${delta>0?'↑':delta<0?'↓':'→'} vs same fixtures` : 'No comparable yet';
  summaryNote.textContent = proxyCount ? `Includes ${proxyCount} proxy fixture(s) where promoted opponent replaces relegated ${Object.values(mapping[`${prevSeasonLabel}->${curSeasonLabel}`]||{}).join(', ')} (1→18,2→19,3→20).` : '';
  tableTitle.textContent = `${cmp.team.replace(' FC','')} — ${curSeasonLabel} vs ${prevSeasonLabel} same fixtures`;
  tableMeta.textContent = `${rows.length} fixtures • ${comparable} comparable played • ${proxyCount} proxy`;

  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    const ftCur = r.ftCur ? `${r.ftCur[0]}-${r.ftCur[1]}` : '—';
    const ftLast = r.ftLast ? `${r.ftLast[0]}-${r.ftLast[1]}` : (r.last ? '—' : '—');
    const curPts = r.isPlayed ? (r.curPts ?? '–') : '–';
    const lastPts = r.last && r.ftLast ? (r.lastPts ?? '–') : '–';
    const deltaCell = (r.isPlayed && r.last && r.ftLast) ? (r.curPts - r.lastPts) : null;
    const deltaStr = deltaCell===null ? '—' : (deltaCell>0?`+${deltaCell}`: `${deltaCell}`);
    const deltaCls = deltaCell===null ? '' : deltaCell>0?'pos':deltaCell<0?'neg':'';
    const oppShort = r.opp.replace(' FC','').replace(' AFC','');
    const venueLabel = r.venue === 'H' ? 'Home' : 'Away';
    const badges = [];
    if (r.cur && r.cur._source==='manual') badges.push('<span class="badge manual">Manual</span>');
    if (r.proxy) badges.push('<span class="badge proxy">Proxy</span>');
    const note = r.note ? `<div class="help" style="margin:0">${r.note}${r.proxy ? ` <code>${r.proxy.from.replace(' FC','')} → ${r.proxy.to.replace(' FC','')}</code>`:''}</div>` : '';
    tr.innerHTML = `
      <td>${r.date||''}</td>
      <td class="muted">${r.round||''}</td>
      <td>${oppShort} ${badges.join(' ')}</td>
      <td>${venueLabel}</td>
      <td>${ftCur} <span class="muted">(${curPts})</span> ${r.cur && r.cur._source==='manual'?'':''}</td>
      <td>${ftLast} <span class="muted">(${lastPts})</span> ${note}</td>
      <td class="delta ${deltaCls}">${deltaStr}</td>
      <td>
        <button class="small" data-edit="${r.cur._key}">Edit</button>
        <button class="small danger" data-del="${r.cur._key}">Del</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
  if (rows.length===0) {
    tbody.innerHTML = '<tr><td colspan="8" class="muted">No fixtures for this team/season.</td></tr>';
  }
  // attach edit/delete
  tbody.querySelectorAll('[data-edit]').forEach(btn=>{
    btn.addEventListener('click', ()=> {
      const key = btn.getAttribute('data-edit');
      const {cur} = parseSeasonPair(seasonSel.value);
      const matches = getEffectiveMatches(cur);
      const m = matches.find(x=> x._key===key);
      openDialog(m);
    });
  });
  tbody.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click', ()=> {
      const key = btn.getAttribute('data-del');
      if (!confirm('Delete this fixture? (Official will be removed, manual will be deleted)')) return;
      const {cur} = parseSeasonPair(seasonSel.value);
      const manual = loadManual(cur);
      const idx = manual.findIndex(x=> fixtureKey(x.team1||x.home, x.team2||x.away, x.date)===key);
      if (idx!==-1) {
        manual.splice(idx,1);
        saveManual(cur, manual);
      } else {
        const del = loadDeleted(cur);
        del.add(key);
        saveDeleted(cur, del);
      }
      // also clear shared ?m= if present? keep shared until dismissed
      refresh();
      writeUrl();
    });
  });
}

function openDialog(existing) {
  const {cur} = parseSeasonPair(seasonSel.value);
  const teams = teamsBySeason[cur] || [];
  // populate if needed already done
  if (existing) {
    fDate.value = existing.date || '';
    fHome.value = existing.team1;
    fAway.value = existing.team2;
    const ft = getFT(existing.score);
    fHg.value = ft ? ft[0] : '';
    fAg.value = ft ? ft[1] : '';
    fRound.value = existing.round || '';
    fKey.value = existing._key;
    document.getElementById('dialogTitle').textContent = 'Edit Result';
  } else {
    fDate.value = new Date().toISOString().slice(0,10);
    fHome.value = currentTeam;
    fAway.value = teams.find(t=>t!==currentTeam) || teams[0];
    fHg.value = ''; fAg.value=''; fRound.value='Manual'; fKey.value='';
    document.getElementById('dialogTitle').textContent = 'Add Result';
  }
  dialog.showModal();
}

function onSave(e) {
  e.preventDefault();
  const {cur} = parseSeasonPair(seasonSel.value);
  const home = fHome.value, away = fAway.value, date = fDate.value, hg = Number(fHg.value), ag = Number(fAg.value), round = fRound.value || 'Manual', oldKey = fKey.value;
  if (home===away) { alert('Home and away must differ'); return; }
  if (!date || isNaN(hg) || isNaN(ag)) { alert('Fill date and scores'); return; }
  const manual = loadManual(cur);
  const newKey = fixtureKey(home, away, date);
  // If editing, remove old entry if key changed, also handle official deletion via manual override (no need to track deleted, manual overwrites)
  // If oldKey and newKey differ, remove old manual if exists and remove deleted tracking
  if (oldKey && oldKey !== newKey) {
    const idxOld = manual.findIndex(x=> fixtureKey(x.team1||x.home, x.team2||x.away, x.date)===oldKey);
    if (idxOld!==-1) manual.splice(idxOld,1);
    // if oldKey was official, we should ensure it's not in deleted set (since we're replacing)
    const del = loadDeleted(cur);
    if (del.has(oldKey)) { del.delete(oldKey); saveDeleted(cur, del); }
  }
  // Remove any existing manual with same newKey (overwrite)
  const idx = manual.findIndex(x=> fixtureKey(x.team1||x.home, x.team2||x.away, x.date)===newKey);
  const rec = { team1: home, team2: away, date, round, score: {ft:[hg,ag]}, ft:[hg,ag], _manualId:newKey };
  if (idx!==-1) manual[idx]=rec; else manual.push(rec);
  // If newKey corresponds to an official fixture that was previously deleted, remove from deleted
  const del2 = loadDeleted(cur);
  if (del2.has(newKey)) { del2.delete(newKey); saveDeleted(cur, del2); }
  saveManual(cur, manual);
  dialog.close();
  refresh();
  writeUrl();
  // If shared banner exists, update? leave shared until dismissed; but new manual is local so share link should reflect local now. Update URL to local manual if shared present? Keep shared until apply.
  if (!readUrlState().m) writeUrl();
  else {
    // update shared? For now keep shared, but also need to ensure local saved. User can copy new link.
  }
}

async function copyShareLink() {
  const {cur} = parseSeasonPair(seasonSel.value);
  let manual = loadManual(cur);
  const urlState = readUrlState();
  if (urlState.m) {
    // if viewing shared, share the shared version plus any local edits? Use local
    manual = loadManual(cur); // local
    if (manual.length===0) manual = decodeManual(urlState.m);
  }
  const encoded = encodeManual(manual);
  const url = new URL(location.href);
  if (encoded) {
    if (encoded.length > 1800) {
      alert('Too many manual results to fit in URL ( >1800 chars). Use Export JSON instead.');
      return;
    }
    url.searchParams.set('m', encoded);
  } else {
    url.searchParams.delete('m');
  }
  url.searchParams.set('team', currentTeam);
  url.searchParams.set('season', cur);
  try { await navigator.clipboard.writeText(url.toString()); shareBtn.textContent='Copied!'; setTimeout(()=>shareBtn.textContent='Copy Share Link',1500); }
  catch { prompt('Copy link:', url.toString()); }
}

function exportJson() {
  const {cur} = parseSeasonPair(seasonSel.value);
  const manual = loadManual(cur);
  const blob = new Blob([JSON.stringify(manual, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`manual-${cur}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

function importJson(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const arr = JSON.parse(reader.result);
      if (!Array.isArray(arr)) throw new Error('Expected array');
      const {cur} = parseSeasonPair(seasonSel.value);
      saveManual(cur, arr);
      refresh(); writeUrl();
      alert(`Imported ${arr.length} manual results for ${cur}`);
    } catch (err) { alert('Import failed: '+ err.message); }
  };
  reader.readAsText(file);
  e.target.value='';
}

// init
init();

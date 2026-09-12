import { getFT, pointsForTeam } from './normalize.js';

export function buildLookup(matches) {
  // Map by home|away (strict) -> fixture. If multiple fixtures same home/away (should not), keep last.
  const map = new Map();
  for (const m of matches) {
    const ft = getFT(m.score);
    // key strict home away
    const key = `${m.team1}|${m.team2}`.toLowerCase();
    map.set(key, m);
  }
  return map;
}

export function compareTeam(team, currentMatches, lastMatches, mappingForPair) {
  // currentMatches and lastMatches are arrays of {team1, team2, date, score, round}
  // mappingForPair is {promotedTeam: relegatedTeam}
  const lastLookup = buildLookup(lastMatches);
  const lastTeams = new Set(lastMatches.flatMap(m => [m.team1, m.team2]));

  let thisPts = 0, lastPts = 0, comparable = 0, proxyCount = 0;
  const rows = [];

  // Filter current fixtures involving team that are played
  const curFixtures = currentMatches.filter(m => m.team1===team || m.team2===team).sort((a,b)=> (a.date||'').localeCompare(b.date||''));

  for (const cur of curFixtures) {
    const ftCur = getFT(cur.score);
    const isPlayed = ftCur !== null;
    const opp = cur.team1===team ? cur.team2 : cur.team1;
    const venue = cur.team1===team ? 'H' : 'A';
    const curPts = isPlayed ? pointsForTeam(ftCur, cur.team1, cur.team2, team) : null;
    if (isPlayed) thisPts += curPts;

    // Find strict match last season
    let last = null;
    let lastPtsVal = null;
    let proxy = null;
    let note = '';

    const strictKey = venue==='H' ? `${team}|${opp}`.toLowerCase() : `${opp}|${team}`.toLowerCase();
    // Actually strict: home must match home. If venue H, team is home vs opp; key team|opp
    // If venue A, team is away vs opp home; key opp|team
    const key = venue==='H' ? `${team}|${opp}`.toLowerCase() : `${opp}|${team}`.toLowerCase();
    last = lastLookup.get(key) || null;

    if (!last && mappingForPair && mappingForPair[opp]) {
      const mappedOpp = mappingForPair[opp];
      const proxyKey = venue==='H' ? `${team}|${mappedOpp}`.toLowerCase() : `${mappedOpp}|${team}`.toLowerCase();
      const proxyMatch = lastLookup.get(proxyKey) || null;
      if (proxyMatch) {
        last = proxyMatch;
        proxy = { from: opp, to: mappedOpp };
        proxyCount++;
        note = `Proxy: ${teamShortProxy(mappedOpp)} (relegated) → ${teamShortProxy(opp)}`;
      }
    }

    if (last) {
      const ftLast = getFT(last.score);
      if (ftLast) {
        lastPtsVal = pointsForTeam(ftLast, last.team1, last.team2, team);
        // Only count comparable if both played? For delta, if cur not played, last not counted yet? But spec says comparable = completed same fixtures
        if (isPlayed) {
          lastPts += lastPtsVal;
          comparable++;
        }
      } else {
        // last not played (should not happen for complete season)
        lastPtsVal = null;
      }
      if (!proxy && last && !lastTeams.has(opp) && venue) {
        // opp was not in lastTeams but we found via proxy? already handled
      }
    } else {
      // No comparable
      if (isPlayed) {
        // Not comparable — don't add to lastPts, but track for display
        note = note || 'No comparable fixture (promoted / no strict match)';
      } else {
        note = note || 'Upcoming';
      }
    }

    rows.push({
      date: cur.date,
      round: cur.round,
      opp,
      venue,
      cur,
      ftCur,
      curPts,
      last,
      ftLast: last ? getFT(last.score) : null,
      lastPts: lastPtsVal,
      proxy,
      note,
      isPlayed,
    });
  }

  const delta = thisPts - lastPts;
  // Also count future fixtures not yet played separately
  const playedRows = rows.filter(r=>r.isPlayed);
  const pendingRows = rows.filter(r=>!r.isPlayed);

  return { team, thisPts, lastPts, delta, comparable, proxyCount, rows, playedRows, pendingRows };
}

function teamShortProxy(name) {
  return name.replace(' FC','').replace(' AFC','');
}

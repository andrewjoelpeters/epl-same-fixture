import { getFT, pointsForTeam } from './normalize.js';

export function buildCumulative(team, curMatches, prevMatches, mapping, curTeams) {
  // Build lookup for prev strict
  const prevLookup = new Map();
  for (const m of prevMatches) prevLookup.set(`${m.team1}|${m.team2}`.toLowerCase(), m);

  // Filter cur fixtures for team, sorted chronological by date then round
  const curRows = curMatches
    .filter(m => m.team1 === team || m.team2 === team)
    .slice()
    .sort((a,b) => (a.date||'').localeCompare(b.date||'') || (a.round||'').localeCompare(b.round||''));

  // If curTeams provided, ensure we include all 38 fixtures in order even if some missing? curRows already has all 38 (including unplayed with score=null). So we use it as x domain.
  // For completeness, if some fixtures missing from data, pad with opponents list
  let points = [];
  let cumA = 0, cumB = 0;
  for (let i = 0; i < curRows.length; i++) {
    const cur = curRows[i];
    const ftCur = getFT(cur.score);
    const isPlayed = ftCur !== null;
    const opp = cur.team1 === team ? cur.team2 : cur.team1;
    const venue = cur.team1 === team ? 'H' : 'A';
    const proxyOpp = mapping && mapping[opp] ? mapping[opp] : opp;
    const key = venue === 'H' ? `${team}|${proxyOpp}`.toLowerCase() : `${proxyOpp}|${team}`.toLowerCase();
    const prev = prevLookup.get(key) || null;
    const ftPrev = prev ? getFT(prev.score) : null;

    const aPts = isPlayed ? pointsForTeam(ftCur, cur.team1, cur.team2, team) : null;
    const bPts = (isPlayed && ftPrev) ? pointsForTeam(ftPrev, prev.team1, prev.team2, team) : null;

    // plateau: only advance when cur played
    if (aPts !== null) cumA += aPts;
    if (aPts !== null && bPts !== null) cumB += bPts;
    // if cur unplayed, both stay flat (do not advance)

    points.push({
      x: i + 1,
      date: cur.date,
      opp,
      venue,
      aPts,
      bPts,
      cumA,
      cumB,
      delta: cumA - cumB,
      isPlayed,
      isProxy: proxyOpp !== opp,
      ftCur,
      ftPrev,
      curMatch: cur,
      prevMatch: prev,
    });
  }

  const maxY = Math.max(...points.map(p => Math.max(p.cumA, p.cumB)), 1);
  // dynamic: round up to next 5 for readability, but keep tight for early season
  const roundedMax = Math.max(5, Math.ceil(maxY / 5) * 5);
  return { points, maxY: roundedMax, curRows };
}

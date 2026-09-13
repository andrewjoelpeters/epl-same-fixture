import { getFT, pointsForTeam } from './normalize.js';

export function buildCumulative(team, curMatches, prevMatches, mapping, curTeams) {
  // Build lookup for prev strict
  const prevLookup = new Map();
  for (const m of prevMatches) prevLookup.set(`${m.team1}|${m.team2}`.toLowerCase(), m);

  // Filter cur fixtures for team
  let curRows = curMatches
    .filter(m => m.team1 === team || m.team2 === team)
    .slice();
  for (const r of curRows) {
    if (r.gameNumber == null && r.game_number != null) r.gameNumber = r.game_number;
    if (r.gameNumber != null) r.gameNumber = Number(r.gameNumber);
  }
  // Fixed 1..38 ordering: manual gameNumber occupies its slot, others fill by date
  const withGn = curRows.filter(r => r.gameNumber != null).sort((a,b)=> a.gameNumber - b.gameNumber);
  const withoutGn = curRows.filter(r => r.gameNumber == null).sort((a,b)=>(a.date||'').localeCompare(b.date||'') || (a.round||'').localeCompare(b.round||''));
  const ordered = [];
  let wi = 0;
  for (let gn = 1; gn <= 38; gn++) {
    const manual = withGn.find(r=>r.gameNumber===gn);
    if (manual) ordered.push(manual);
    else if (wi < withoutGn.length) ordered.push(withoutGn[wi++]);
  }
  while (wi < withoutGn.length) ordered.push(withoutGn[wi++]);
  curRows = ordered.slice(0, 38);

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

    if (aPts !== null) cumA += aPts;
    if (aPts !== null && bPts !== null) cumB += bPts;

    const gameNumber = cur.gameNumber ?? cur.game_number ?? (i + 1);
    points.push({
      x: Number(gameNumber),
      date: cur.date,
      gameNumber: Number(gameNumber),
      opp,
      venue,
      aPts,
      bPts,
      cumA,
      cumB,
      delta: isPlayed ? cumA - cumB : null,
      isPlayed,
      isProxy: proxyOpp !== opp,
      ftCur,
      ftPrev,
      curMatch: cur,
      prevMatch: prev,
    });
  }
  // ensure points sorted by x (gameNumber) for chart
  points.sort((a,b)=> a.x - b.x);

  // fixed x at 38, even when unplayed — keep all points, but future not drawn
  let lastPlayedIdx = -1;
  for (let i = 0; i < points.length; i++) if (points[i].isPlayed) lastPlayedIdx = i;
  // for future games, keep x but mark delta as null so line stops; y max based on played only
  const playedPoints = lastPlayedIdx >= 0 ? points.slice(0, lastPlayedIdx + 1) : [];
  const curMax = playedPoints.length ? Math.max(...playedPoints.map(p => p.cumA)) : 0;
  const bothMax = playedPoints.length ? Math.max(...playedPoints.map(p => Math.max(p.cumA, p.cumB)), 1) : 5;
  const withHeadroom = Math.max(bothMax, curMax + 5);
  const roundedMax = Math.max(5, Math.ceil(withHeadroom / 5) * 5);
  // keep all 38 points for fixed x-axis, but future deltas will be null in chart data
  for (const p of points) { p.isProjected = false; p.projCumA = p.cumA; }
  return { points, maxY: roundedMax, curRows, lastPlayedIdx };
}

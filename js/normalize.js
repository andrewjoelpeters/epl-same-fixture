// Normalize team names and score extraction

export function getFT(score) {
  if (!score) return null;
  if (Array.isArray(score) && score.length===2 && typeof score[0]==='number') return [score[0], score[1]];
  if (score.ft && Array.isArray(score.ft) && score.ft.length===2) return [score.ft[0], score.ft[1]];
  return null;
}

export function canonicalTeam(name, aliases) {
  if (!name) return name;
  // aliases is map short->canonical
  if (aliases && aliases[name]) return aliases[name];
  return name;
}

export function teamShort(canonical) {
  // display short without FC etc but keep canonical for matching
  return canonical.replace(' FC','').replace(' AFC','');
}

export function fixtureKey(home, away, date) {
  // date is YYYY-MM-DD
  return `${home}|${away}|${date}`.toLowerCase();
}

export function pointsForTeam(ft, home, away, team) {
  if (!ft) return null;
  const [hg, ag] = ft;
  const isHome = team === home;
  const isAway = team === away;
  if (!isHome && !isAway) return null;
  if (hg === ag) return 1;
  if (hg > ag) return isHome ? 3 : 0;
  return isAway ? 3 : 0;
}

export function resultLabel(ft, home, away, team) {
  if (!ft) return '-';
  const [hg, ag] = ft;
  const pts = pointsForTeam(ft, home, away, team);
  const wdl = pts===3?'W':pts===1?'D':'L';
  // Always show score from team perspective? Show raw.
  return `${hg}-${ag} (${wdl})`;
}

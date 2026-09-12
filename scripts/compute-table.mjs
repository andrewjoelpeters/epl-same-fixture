export function normalizeTeams(matches) {
  const set = new Set();
  for (const m of matches) {
    if (m.team1) set.add(m.team1);
    if (m.team2) set.add(m.team2);
  }
  return [...set].sort();
}

export function computeTable(matches) {
  const table = new Map();
  function ensure(team) {
    if (!table.has(team)) table.set(team, { team, P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, Pts:0 });
  }
  for (const m of matches) {
    const ft = m.score?.ft ?? (Array.isArray(m.score) ? m.score : null);
    if (!ft || ft.length !== 2) continue;
    const [hg, ag] = ft;
    if (typeof hg !== 'number' || typeof ag !== 'number') continue;
    ensure(m.team1); ensure(m.team2);
    const h = table.get(m.team1);
    const a = table.get(m.team2);
    h.P++; a.P++;
    h.GF += hg; h.GA += ag;
    a.GF += ag; a.GA += hg;
    if (hg > ag) { h.W++; h.Pts += 3; a.L++; }
    else if (hg < ag) { a.W++; a.Pts += 3; h.L++; }
    else { h.D++; a.D++; h.Pts += 1; a.Pts += 1; }
  }
  for (const r of table.values()) r.GD = r.GF - r.GA;
  return [...table.values()].sort((a,b) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF || a.team.localeCompare(b.team));
}

export function standingsOrder(matches) {
  return computeTable(matches).map(r => r.team);
}

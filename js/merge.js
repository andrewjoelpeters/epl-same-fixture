import { fixtureKey } from './normalize.js';

export function mergeMatches(baseMatches, manualArr, deletedKeys) {
  // baseMatches: array from openfootball
  // manualArr: array of manual fixtures {home, away, date, round, ft:[h,a], id?}
  // deletedKeys: Set of keys to delete (official fixtures user deleted)
  const map = new Map();
  for (const m of baseMatches) {
    const key = fixtureKey(m.team1, m.team2, m.date);
    map.set(key, { ...m, _source: 'official', _key: key });
  }
  // apply deletions
  if (deletedKeys) {
    for (const k of deletedKeys) map.delete(k);
  }
  // apply manual (overwrite or add)
  for (const man of manualArr) {
    // man shape: {team1, team2, date, round, score:{ft:[h,a]}, _manualId}
    const home = man.team1 || man.home;
    const away = man.team2 || man.away;
    const ft = man.score?.ft || man.ft;
    const date = man.date;
    if (!home || !away || !date || !ft) continue;
    const key = fixtureKey(home, away, date);
    const rec = {
      team1: home,
      team2: away,
      date,
      round: man.round || 'Manual',
      score: { ft: [Number(ft[0]), Number(ft[1])] },
      _source: 'manual',
      _key: key,
      _manualId: man._manualId || key,
    };
    map.set(key, rec);
  }
  return [...map.values()].sort((a,b)=> (a.date||'').localeCompare(b.date||'') || (a.round||'').localeCompare(b.round||''));
}

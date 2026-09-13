import { fixtureKey, fixtureKeyTeam } from './normalize.js';

export function mergeMatches(baseMatches, manualArr, deletedKeys) {
  const map = new Map();
  // base keyed by team pair only (home|away) — venue strict, date not needed for identity
  for (const m of baseMatches) {
    const key = fixtureKeyTeam(m.team1, m.team2);
    map.set(key, { ...m, _source: 'official', _key: key, _teamKey: key });
  }
  if (deletedKeys) {
    for (const k of deletedKeys) map.delete(k);
  }
  for (const man of manualArr) {
    const home = man.team1 || man.home;
    const away = man.team2 || man.away;
    const ft = man.score?.ft || man.ft;
    const gameNumber = man.gameNumber ?? man.game_number ?? man.gw;
    // support legacy date-based manual
    const date = man.date;
    if (!home || !away || !ft) continue;
    // gameNumber is for ordering, not identity — key is still home|away
    const key = fixtureKeyTeam(home, away);
    // also handle legacy date-based keys stored in deletedKeys set
    const rec = {
      team1: home,
      team2: away,
      date: date || null,
      gameNumber: gameNumber != null ? Number(gameNumber) : null,
      round: man.round || (gameNumber ? `Matchday ${gameNumber}` : 'Manual'),
      score: { ft: [Number(ft[0]), Number(ft[1])] },
      _source: 'manual',
      _key: key,
      _teamKey: key,
      _manualId: man._manualId || key,
    };
    map.set(key, rec);
  }
  // sort: manual with gameNumber first by gameNumber, otherwise by date
  return [...map.values()].sort((a,b)=>{
    const aGn = a.gameNumber ?? a._gameNumber ?? null;
    const bGn = b.gameNumber ?? b._gameNumber ?? null;
    if (aGn != null && bGn != null) return aGn - bGn;
    if (aGn != null) return -1;
    if (bGn != null) return 1;
    return (a.date||'').localeCompare(b.date||'') || (a.round||'').localeCompare(b.round||'');
  });
}

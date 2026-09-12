const PREFIX = 'epl-manual-';

export function loadManual(season) {
  try {
    const raw = localStorage.getItem(PREFIX + season);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveManual(season, arr) {
  localStorage.setItem(PREFIX + season, JSON.stringify(arr));
}

export function clearManual(season) {
  localStorage.removeItem(PREFIX + season);
}

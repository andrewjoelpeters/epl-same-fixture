export async function fetchSeason(season) {
  // Try same-origin public/data first (GH Actions synced), fallback to raw github
  const sameOrigin = `public/data/en.1.${season}.json`;
  const raw = `https://raw.githubusercontent.com/openfootball/football.json/master/${season}/en.1.json`;
  // simple cache via sessionStorage
  const cacheKey = `cache-pl-${season}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try { const j = JSON.parse(cached); if (j && j.matches) return j; } catch {}
  }
  let data = null;
  let lastErr = null;
  for (const url of [sameOrigin, raw]) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(url + ' ' + res.status);
      data = await res.json();
      if (data && data.matches) {
        try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
        return data;
      }
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Failed to fetch ' + season);
}

export async function fetchMapping() {
  const sameOrigin = `public/data/mapping.json`;
  const rawFallback = null;
  try {
    const res = await fetch(sameOrigin);
    if (res.ok) return await res.json();
  } catch {}
  // fallback to generated js if exists, else empty
  try {
    const { MAPPING } = await import('./mapping.generated.js');
    return MAPPING;
  } catch { return {}; }
}

export async function fetchManifest() {
  try {
    const res = await fetch(`public/data/manifest.json`);
    if (res.ok) return await res.json();
  } catch { return null; }
}

export function encodeManual(arr) {
  if (!arr || arr.length===0) return '';
  const json = JSON.stringify(arr);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decodeManual(str) {
  if (!str) return [];
  try {
    let b64 = str.replace(/-/g,'+').replace(/_/g,'/');
    while (b64.length %4) b64 += '=';
    const json = decodeURIComponent(escape(atob(b64)));
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
export function readUrlState() {
  const p = new URLSearchParams(location.search);
  return {
    team: p.get('team') || '',
    a: p.get('a') || p.get('season') || '',
    b: p.get('b') || '',
    season: p.get('season') || '',
    m: p.get('m') || '',
  };
}
export function writeUrlState({team, a, b, manual}) {
  const p = new URLSearchParams(location.search);
  if (team) p.set('team', team); else p.delete('team');
  if (a) p.set('a', a); else p.delete('a');
  if (b) p.set('b', b); else p.delete('b');
  p.delete('season');
  const encoded = encodeManual(manual);
  if (encoded) {
    if (encoded.length > 1800) p.delete('m');
    else p.set('m', encoded);
  } else p.delete('m');
  const qs = p.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
}

// Simple base64url encode/decode for manual fixtures sharing
// We avoid external lz-string dep for now; URL limit ~2k chars fits ~15 fixtures easily.
// Fallback: if encoded > 1800 chars, recommend Export JSON.

export function encodeManual(arr) {
  if (!arr || arr.length===0) return '';
  const json = JSON.stringify(arr);
  // btoa works for ASCII; ensure UTF-8 via encodeURIComponent
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
  } catch (e) {
    console.warn('decodeManual failed', e);
    return [];
  }
}

export function readUrlState() {
  const p = new URLSearchParams(location.search);
  return {
    team: p.get('team') || '',
    season: p.get('season') || '',
    m: p.get('m') || '',
    h2h: p.get('h2h') || '',
  };
}

export function writeUrlState({team, season, manual, h2h}) {
  const p = new URLSearchParams(location.search);
  if (team) p.set('team', team); else p.delete('team');
  if (season) p.set('season', season); else p.delete('season');
  if (h2h) p.set('h2h','1'); else p.delete('h2h');
  const encoded = encodeManual(manual);
  if (encoded) {
    if (encoded.length > 1800) {
      // Too long — don't put in URL, advise export
      p.delete('m');
    } else {
      p.set('m', encoded);
    }
  } else {
    p.delete('m');
  }
  const qs = p.toString();
  const url = location.pathname + (qs ? '?' + qs : '') + location.hash;
  history.replaceState(null, '', url);
}

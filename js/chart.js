export function renderCumulativeChart(host, points, opts = {}) {
  const { curLabel = 'A', prevLabel = 'B', maxY = 10, mode = 'delta' } = opts;
  host.innerHTML = '';
  if (!points || points.length === 0) {
    host.innerHTML = '<div style="padding:14px;color:#6b6560;font-size:13px">No data — add a result to see the chart.</div>';
    return;
  }

  const isDual = mode === 'dual';
  const W = host.clientWidth || 600;
  const H = W < 640 ? 200 : 220;
  host.style.height = H + 'px';

  const m = { top: 14, right: 12, bottom: 20, left: 44 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  // x: 1..38 fixed
  const xMin = 1, xMax = 38;
  const xScale = (x) => m.left + ((x - xMin) / (xMax - xMin)) * iw;

  // y
  let yMin, yMax;
  if (isDual) {
    yMin = 0; yMax = maxY;
  } else {
    const deltas = points.filter(p=>p.delta!==null&&p.delta!==undefined).map(p=>p.delta);
    const maxAbs = Math.max(0, ...deltas.map(d=>Math.abs(d)), 3);
    const limit = Math.max(5, Math.ceil((maxAbs + 2) / 5) * 5);
    yMin = -limit; yMax = limit;
  }
  const yScale = (y) => m.top + (1 - (y - yMin) / (yMax - yMin)) * ih;

  const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const hits = [];
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Cumulative chart" style="display:block">`;

  // grid: horizontal — quiet, zero only slightly darker
  const yStep = isDual ? (yMax <= 10 ? 5 : 10) : ( (yMax - yMin) <= 10 ? 5 : 10);
  for (let y = yMin; y <= yMax; y += yStep) {
    const py = yScale(y);
    const isZero = y === 0;
    svg += `<line x1="${m.left}" y1="${py}" x2="${m.left+iw}" y2="${py}" stroke="${isZero?'#d6d0cb':'#f0ece8'}" stroke-width="${isZero?.9:.6}" />`;
    const label = y > 0 ? (isDual ? String(y) : `+${y}`) : String(y);
    svg += `<text x="${m.left-10}" y="${py+3}" text-anchor="end" font-size="10" fill="#6b6560" font-family="Inter, sans-serif">${label}</text>`;
  }
  // x grid: evens only
  for (let x = 2; x <= 38; x += 2) {
    const px = xScale(x);
    svg += `<line x1="${px}" y1="${m.top}" x2="${px}" y2="${m.top+ih}" stroke="#f5f3f1" stroke-width=".6"/>`;
  }

  // x tick labels: evens only
  for (let x = 2; x <= 38; x += 2) {
    const px = xScale(x);
    svg += `<text x="${px}" y="${m.top+ih+16}" text-anchor="middle" font-size="10" fill="#6b6560" font-family="Inter, sans-serif">${x}</text>`;
  }

  if (isDual) {
    // dual lines: cumA (current) bold, cumB (prev) muted
    const pts = points.slice().sort((a,b)=>a.x-b.x);
    // played only — no projection for unplayed games
    let lastPlayedIdx = -1;
    pts.forEach((p,i)=>{ if(p.isPlayed) lastPlayedIdx=i; });
    const played = pts.slice(0, lastPlayedIdx+1);

    const lineFor = (key, arr, color, width, opacity) => {
      if (arr.length < 1) return '';
      if (arr.length === 1) return `<circle cx="${xScale(arr[0].x)}" cy="${yScale(arr[0][key])}" r="2.5" fill="${color}" opacity="${opacity}"/>`;
      let d = `M ${xScale(arr[0].x)} ${yScale(arr[0][key])}`;
      for (let i=1;i<arr.length;i++) d += ` L ${xScale(arr[i].x)} ${yScale(arr[i][key])}`;
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
    };
    // prev (muted)
    svg += lineFor('cumB', played, '#9a9590', 1.6, .95);
    // cur (accent blue / ink)
    svg += lineFor('cumA', played, '#1a4fb3', 2.1, 1);

    // dots for played
    played.forEach(p=>{
      svg += `<circle cx="${xScale(p.x)}" cy="${yScale(p.cumB)}" r="2.2" fill="#9a9590" stroke="#fff" stroke-width="1"/>`;
      svg += `<circle cx="${xScale(p.x)}" cy="${yScale(p.cumA)}" r="2.6" fill="#1a4fb3" stroke="#fff" stroke-width="1"/>`;
      hits.push({cx:xScale(p.x), cy:yScale(p.cumA), p});
    });
    // legend
    svg += `<g font-family="Inter, sans-serif" font-size="10" font-weight="600">`;
    svg += `<line x1="${m.left}" y1="${m.top-2}" x2="${m.left+14}" y2="${m.top-2}" stroke="#1a4fb3" stroke-width="2.1" stroke-linecap="round"/>`;
    svg += `<text x="${m.left+18}" y="${m.top+1}" fill="#1a4fb3">${esc(curLabel)}</text>`;
    svg += `<line x1="${m.left+72}" y1="${m.top-2}" x2="${m.left+86}" y2="${m.top-2}" stroke="#9a9590" stroke-width="1.6" stroke-linecap="round"/>`;
    svg += `<text x="${m.left+90}" y="${m.top+1}" fill="#6b6560">${esc(prevLabel)}</text>`;
    svg += `</g>`;
  } else {
    // delta mode
    const sorted = points.slice().sort((a,b)=>a.x-b.x);
    // find last played index in sorted
    let lastPlayedIdx = -1;
    sorted.forEach((p,i)=>{ if(p.isPlayed) lastPlayedIdx=i; });
    const solid = lastPlayedIdx>=0 ? sorted.slice(0, lastPlayedIdx+1).filter(p=>p.delta!==null) : [];
    // build segmented path colored by sign (split at zero crossing)
    const segs = [];
    for(let i=1;i<solid.length;i++){
      const a=solid[i-1], b=solid[i];
      if(a.delta===null||b.delta===null) continue;
      // if straddles zero, split at y=0
      if((a.delta>0 && b.delta<0) || (a.delta<0 && b.delta>0)){
        const t = Math.abs(a.delta) / (Math.abs(a.delta)+Math.abs(b.delta));
        const xm = xScale(a.x + t*(b.x-a.x));
        const y0 = yScale(0);
        const xa=xScale(a.x), ya=yScale(a.delta), xb=xScale(b.x), yb=yScale(b.delta);
        const colA = a.delta>0?'#0f7a3d':'#b42318';
        const colB = b.delta>0?'#0f7a3d':'#b42318';
        segs.push({x1:xa,y1:ya,x2:xm,y2:y0,col:colA});
        segs.push({x1:xm,y1:y0,x2:xb,y2:yb,col:colB});
      } else {
        const col = (a.delta+b.delta)/2 >0.05 ? '#0f7a3d' : (a.delta+b.delta)/2 < -0.05 ? '#b42318' : '#6b6560';
        segs.push({x1:xScale(a.x),y1:yScale(a.delta),x2:xScale(b.x),y2:yScale(b.delta),col});
      }
    }
    segs.forEach(s=>{ svg+=`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.col}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`; });
    // dots
    solid.forEach(p=>{
      const col = p.delta>0?'#0f7a3d':p.delta<0?'#b42318':'#6b6560';
      svg+=`<circle cx="${xScale(p.x)}" cy="${yScale(p.delta)}" r="4" fill="${col}" stroke="#fff" stroke-width="1.2"/>`;
      hits.push({cx:xScale(p.x), cy:yScale(p.delta), p});
    });
  }

  svg += `</svg>`;
  host.innerHTML = svg;

  // rich tooltip: table info (prev → cur + venue diff) + cumulative change
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.style.display = 'none';
  host.appendChild(tip);
  const signed = (d) => d > 0 ? `+${d}` : `${d}`;
  const showTip = (i) => {
    const h = hits[i];
    if (!h) return;
    const p = h.p;
    const oppS = esc((p.opp || '').replace(' FC', '').replace(' AFC', ''));
    const ftP = p.ftPrev ? `${p.ftPrev[0]}–${p.ftPrev[1]}` : '—';
    const ftC = p.ftCur ? `${p.ftCur[0]}–${p.ftCur[1]}` : '—';
    const vd = (p.aPts != null && p.bPts != null) ? p.aPts - p.bPts : null;
    const vdT = vd == null ? '–' : signed(vd);
    const dT = signed(p.delta);
    const cls = p.delta > 0 ? 'pos' : p.delta < 0 ? 'neg' : 'neu';
    tip.innerHTML = `
      <div class="tip-title">Game ${p.x} · ${oppS} ${p.venue}</div>
      <div class="tip-scores">${ftP} <span class="tip-arrow">→</span> ${ftC} <b class="${cls}">${vdT}</b></div>
      <div class="tip-total">Total ${p.cumA} vs ${p.cumB} <b class="${cls}">(${dT})</b></div>`;
    tip.style.display = 'block';
    const rect = host.getBoundingClientRect();
    const kx = rect.width ? rect.width / W : 1;
    const ky = rect.height ? rect.height / H : 1;
    let left = h.cx * kx - tip.offsetWidth / 2;
    left = Math.max(6, Math.min(rect.width - tip.offsetWidth - 6, left));
    let top = h.cy * ky - tip.offsetHeight - 10;
    if (top < 4) top = h.cy * ky + 14;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  };
  const hideTip = () => { tip.style.display = 'none'; };
  const svgEl = host.querySelector('svg');
  if (svgEl && hits.length) {
    let curTip = -1;
    const pick = (clientX) => {
      const rect = svgEl.getBoundingClientRect();
      if (!rect.width) return -1;
      const sx = (clientX - rect.left) * (W / rect.width);
      let best = -1, bd = Infinity;
      for (let i = 0; i < hits.length; i++) {
        const d = Math.abs(hits[i].cx - sx);
        if (d < bd) { bd = d; best = i; }
      }
      return bd < 20 ? best : -1;
    };
    svgEl.addEventListener('pointermove', (e) => {
      const i = pick(e.clientX);
      if (i !== curTip) { curTip = i; if (i >= 0) showTip(i); else hideTip(); }
    });
    svgEl.addEventListener('pointerleave', () => { curTip = -1; hideTip(); });
    svgEl.addEventListener('click', (e) => {
      const i = pick(e.clientX);
      curTip = i;
      if (i >= 0) showTip(i); else hideTip();
    });
  }
}

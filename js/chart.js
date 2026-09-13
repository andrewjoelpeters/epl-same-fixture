export function renderCumulativeChart(host, points, opts = {}) {
  const { maxY, curLabel = 'A', prevLabel = 'B' } = opts;
  host.innerHTML = '';
  if (!points || points.length === 0) {
    host.innerHTML = '<div style="padding:12px;color:#6b6560;font-size:12px">No data</div>';
    return;
  }
  const W = host.clientWidth || 700;
  const H = 160;
  const m = { l: 28, r: 8, t: 8, b: 20 };
  const n = points.length;
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  const x = i => m.l + (n === 1 ? 0 : (i / (n - 1)) * iw);
  const y = v => m.t + (1 - v / maxY) * ih;

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', H);
  svg.style.display = 'block';
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Cumulative points ${curLabel} vs ${prevLabel}`);

  // grid
  const gridG = document.createElementNS(NS, 'g');
  const yTicks = [0, Math.round(maxY/2), maxY];
  for (const v of yTicks) {
    const yy = y(v);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', m.l); line.setAttribute('x2', W - m.r);
    line.setAttribute('y1', yy); line.setAttribute('y2', yy);
    line.setAttribute('stroke', '#e6e2de'); line.setAttribute('stroke-width', v===0?'0.8':'0.4');
    if (v !== 0) line.setAttribute('stroke-dasharray', '2 4');
    gridG.appendChild(line);
    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('x', m.l - 4); txt.setAttribute('y', yy + 3);
    txt.setAttribute('text-anchor', 'end'); txt.setAttribute('font-size', '8');
    txt.setAttribute('fill', '#6b6560'); txt.setAttribute('font-family', 'Inter, system-ui, sans-serif');
    txt.textContent = String(v);
    gridG.appendChild(txt);
  }
  // x ticks every 5
  for (let i = 5; i <= n; i += 5) {
    const xx = x(i - 1);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', xx); line.setAttribute('x2', xx);
    line.setAttribute('y1', H - m.b); line.setAttribute('y2', H - m.b + 3);
    line.setAttribute('stroke', '#d6d0cb'); line.setAttribute('stroke-width', '0.6');
    gridG.appendChild(line);
    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('x', xx); txt.setAttribute('y', H - 4);
    txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', '7');
    txt.setAttribute('fill', '#6b6560'); txt.textContent = String(i);
    gridG.appendChild(txt);
  }
  svg.appendChild(gridG);

  // area between lines - full area shading
  const areaG = document.createElementNS(NS, 'g');
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i], p1 = points[i+1];
    const x0 = x(i), x1 = x(i+1);
    const yA0 = y(p0.cumA), yB0 = y(p0.cumB);
    const yA1 = y(p1.cumA), yB1 = y(p1.cumB);
    const d0 = p0.cumA - p0.cumB;
    const d1 = p1.cumA - p1.cumB;
    // if both future unplayed plateau, the segment is flat but still between same values - check if both isPlayed false for p1? The cum values will be equal to previous, so area will be whatever previous delta was
    // Determine if this segment is after last played - fade it
    const isFuture = !p1.isPlayed && !p0.isPlayed && i > points.findIndex(p=>!p.isPlayed) - 1;
    // Actually determine if p1 is unplayed (plateau), we still shade but with lower opacity
    const opacity = (p1.isPlayed || p0.isPlayed) ? '0.55' : '0.22';

    if ((d0 >= 0 && d1 >= 0) || (d0 <= 0 && d1 <= 0)) {
      // no crossing
      const isPos = d0 > 0 || d1 > 0;
      // if both zero, no area
      if (d0 === 0 && d1 === 0) continue;
      const path = document.createElementNS(NS, 'path');
      const d = `M ${x0} ${yA0} L ${x1} ${yA1} L ${x1} ${yB1} L ${x0} ${yB0} Z`;
      path.setAttribute('d', d);
      path.setAttribute('fill', isPos ? '#e6f4ea' : '#fde9e7');
      path.setAttribute('opacity', opacity);
      path.setAttribute('stroke', 'none');
      areaG.appendChild(path);
    } else if ((d0 > 0 && d1 < 0) || (d0 < 0 && d1 > 0)) {
      // crossing - find t
      const diff0 = d0, diff1 = d1;
      const t = diff0 / (diff0 - diff1); // 0..1
      const xC = x0 + t * (x1 - x0);
      // y at crossing is same for both lines
      const yC = yA0 + t * (yA1 - yA0); // also = yB0 + t*(yB1-yB0)
      // first polygon (0 -> crossing) has sign of d0, second has sign of d1
      const isPos0 = d0 > 0;
      const pA = document.createElementNS(NS, 'path');
      pA.setAttribute('d', `M ${x0} ${yA0} L ${xC} ${yC} L ${xC} ${yC} L ${x0} ${yB0} Z`);
      // Actually first polygon: x0 yA0 -> xC yC -> xC yC (same) -> x0 yB0
      // For first segment, the bottom is yB, top is yA
      pA.setAttribute('d', `M ${x0} ${yA0} L ${xC} ${yC} L ${x0} ${yB0} Z`.replace(` L ${xC} ${yC} L ${xC} ${yC}`, ` L ${xC} ${yC} L ${x0} ${yB0}`));
      // Simpler: construct correctly
      // First part polygon: A0 -> C -> B0
      const dFirst = `M ${x0} ${yA0} L ${xC} ${yC} L ${x0} ${yB0} Z`;
      // Need quadrilateral: for crossing, shape is triangle, not quad. For first part, points are A0, C, B0. That's triangle if crossing inside.
      // Actually shape from x0 to xC: polygon with vertices A0, C, B0. That's triangle.
      // Second part: C, A1, B1 -> triangle + quad? Let's just create two triangles/quads
      // We'll create two polygons as triangles
      const poly1 = `M ${x0} ${yA0} L ${xC} ${yC} L ${x0} ${yB0} Z`;
      const poly2 = `M ${xC} ${yC} L ${x1} ${yA1} L ${x1} ${yB1} Z`;
      // But poly2 should be C -> A1 -> B1
      pA.setAttribute('d', isPos0 ? poly1 : poly1);
      pA.setAttribute('fill', isPos0 ? '#e6f4ea' : '#fde9e7');
      pA.setAttribute('opacity', opacity);
      areaG.appendChild(pA);
      const pB = document.createElementNS(NS, 'path');
      pB.setAttribute('d', poly2);
      pB.setAttribute('fill', isPos0 ? '#fde9e7' : '#e6f4ea');
      pB.setAttribute('opacity', opacity);
      areaG.appendChild(pB);
      // Correct first poly to be proper quadrilateral when crossing not at endpoint? Actually for crossing, the area on each side is triangle, so poly1 as triangle is correct.
      // But our poly1 above as triangle A0-C-B0 is correct, poly2 as C-A1-B1 is triangle.
      // Update pA d to poly1
      pA.setAttribute('d', poly1);
    }
  }
  svg.appendChild(areaG);

  // lines
  function linePath(key) {
    let d = '';
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const yy = y(key === 'A' ? p.cumA : p.cumB);
      const xx = x(i);
      d += (i === 0 ? `M ${xx} ${yy}` : ` L ${xx} ${yy}`);
    }
    return d;
  }
  const pathA = document.createElementNS(NS, 'path');
  pathA.setAttribute('d', linePath('A'));
  pathA.setAttribute('fill', 'none');
  pathA.setAttribute('stroke', '#111');
  pathA.setAttribute('stroke-width', '1.7');
  pathA.setAttribute('stroke-linecap', 'round');
  pathA.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(pathA);

  const pathB = document.createElementNS(NS, 'path');
  pathB.setAttribute('d', linePath('B'));
  pathB.setAttribute('fill', 'none');
  pathB.setAttribute('stroke', '#6b6560');
  pathB.setAttribute('stroke-width', '1.3');
  pathB.setAttribute('stroke-dasharray', '4 3');
  pathB.setAttribute('stroke-linecap', 'round');
  pathB.setAttribute('stroke-linejoin', 'round');
  pathB.setAttribute('opacity', '0.95');
  svg.appendChild(pathB);

  // dots for played games
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (!p.isPlayed) continue;
    const xx = x(i);
    const yyA = y(p.cumA), yyB = y(p.cumB);
    const dotA = document.createElementNS(NS, 'circle');
    dotA.setAttribute('cx', xx); dotA.setAttribute('cy', yyA); dotA.setAttribute('r', '1.7');
    dotA.setAttribute('fill', '#111'); dotA.setAttribute('stroke', '#fff'); dotA.setAttribute('stroke-width', '0.6');
    svg.appendChild(dotA);
    const dotB = document.createElementNS(NS, 'circle');
    dotB.setAttribute('cx', xx); dotB.setAttribute('cy', yyB); dotB.setAttribute('r', '1.4');
    dotB.setAttribute('fill', '#6b6560'); dotB.setAttribute('stroke', '#fff'); dotB.setAttribute('stroke-width', '0.6');
    svg.appendChild(dotB);
  }

  // x axis line
  const axis = document.createElementNS(NS, 'line');
  axis.setAttribute('x1', m.l); axis.setAttribute('x2', W - m.r);
  axis.setAttribute('y1', H - m.b); axis.setAttribute('y2', H - m.b);
  axis.setAttribute('stroke', '#111'); axis.setAttribute('stroke-width', '0.7');
  svg.appendChild(axis);

  // legend
  const leg = document.createElementNS(NS, 'g');
  const items = [
    { label: curLabel, color: '#111', dash: null },
    { label: prevLabel, color: '#6b6560', dash: '4 3' },
  ];
  items.forEach((it, idx) => {
    const lx = m.l + idx * 70;
    const ly = 10;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', lx); line.setAttribute('x2', lx + 14);
    line.setAttribute('y1', ly); line.setAttribute('y2', ly);
    line.setAttribute('stroke', it.color); line.setAttribute('stroke-width', '1.4');
    if (it.dash) line.setAttribute('stroke-dasharray', it.dash);
    leg.appendChild(line);
    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('x', lx + 16); txt.setAttribute('y', ly + 3);
    txt.setAttribute('font-size', '7'); txt.setAttribute('fill', '#6b6560');
    txt.setAttribute('font-family', 'Inter, system-ui, sans-serif');
    txt.setAttribute('letter-spacing', '0.04em');
    txt.textContent = it.label;
    leg.appendChild(txt);
  });
  svg.appendChild(leg);

  host.appendChild(svg);

  // tooltip
  const tip = document.createElement('div');
  tip.style.position = 'absolute';
  tip.style.pointerEvents = 'none';
  tip.style.background = '#111';
  tip.style.color = '#fff';
  tip.style.fontSize = '11px';
  tip.style.padding = '5px 6px';
  tip.style.borderRadius = '4px';
  tip.style.opacity = '0';
  tip.style.transition = 'opacity .12s';
  tip.style.whiteSpace = 'nowrap';
  tip.style.zIndex = '5';
  host.style.position = 'relative';
  host.appendChild(tip);

  let raf = null;
  function showAt(clientX) {
    const rect = svg.getBoundingClientRect();
    const relX = clientX - rect.left;
    // map to index
    const frac = (relX - m.l * (W / rect.width)) / ((W - m.l - m.r) * (W / rect.width)); // approximate
    // Simpler: use svg viewBox scaling
    const vbW = W;
    const scaleX = rect.width / vbW;
    const svgX = (clientX - rect.left) / scaleX;
    const idxFloat = (svgX - m.l) / (iw) * (n - 1);
    const idx = Math.max(0, Math.min(n - 1, Math.round(idxFloat)));
    const p = points[idx];
    tip.innerHTML = `GW ${p.x} · ${p.opp.replace(' FC','')} ${p.venue} · ${p.ftCur?`${p.ftCur[0]}–${p.ftCur[1]}`:'—'} · <span style="color:#fff">${p.cumA}</span> vs <span style="color:#bbb">${p.cumB}</span> <span style="color:${p.delta>0?'#a3d9b5':p.delta<0?'#f0b4ad':'#fff'}">${p.delta>0?`+${p.delta}`:p.delta}</span>`;
    tip.style.opacity = '1';
    const tx = Math.min(rect.width - tip.offsetWidth - 8, Math.max(8, clientX - rect.left - tip.offsetWidth/2));
    tip.style.left = tx + 'px';
    tip.style.top = '8px';
    // vertical line
    let vline = svg.querySelector('.vline');
    if (!vline) {
      vline = document.createElementNS(NS, 'line');
      vline.setAttribute('class', 'vline');
      vline.setAttribute('stroke', '#d6d0cb');
      vline.setAttribute('stroke-width', '0.6');
      vline.setAttribute('stroke-dasharray', '2 2');
      svg.appendChild(vline);
    }
    const xx = x(idx);
    vline.setAttribute('x1', xx); vline.setAttribute('x2', xx);
    vline.setAttribute('y1', m.t); vline.setAttribute('y2', H - m.b);
  }
  function hide() { tip.style.opacity = '0'; const vline = svg.querySelector('.vline'); if (vline) vline.remove(); }

  host.addEventListener('mousemove', e => { if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(()=>showAt(e.clientX)); });
  host.addEventListener('mouseleave', hide);
  host.addEventListener('touchstart', e => { const t = e.touches[0]; if (t) showAt(t.clientX); }, {passive:true});
  host.addEventListener('touchmove', e => { const t = e.touches[0]; if (t) showAt(t.clientX); }, {passive:true});
}

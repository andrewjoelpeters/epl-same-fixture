import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let chartInstance = null;

export function renderCumulativeChart(host, points, opts = {}) {
  const { curLabel = 'A', prevLabel = 'B' } = opts;
  host.innerHTML = '';
  if (!points || points.length === 0) {
    host.innerHTML = '<div style="padding:12px;color:#6b6560;font-size:12px">No data</div>';
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '200px';
  canvas.style.display = 'block';
  host.appendChild(canvas);
  host.style.position = 'relative';
  host.style.height = '200px';
  if (window.matchMedia('(max-width:620px)').matches) {
    canvas.style.height = '180px';
    host.style.height = '180px';
  }

  if (chartInstance) {
    try { chartInstance.destroy(); } catch {}
    chartInstance = null;
  }

  const n = points.length;
  const labels = points.map(p => p.x);
  // delta line
  const deltas = points.map(p => p.delta);
  const maxAbs = Math.max(...deltas.map(d => Math.abs(d)), 5);
  const yLimit = Math.max(5, Math.ceil((maxAbs + 5) / 5) * 5);
  const yMin = -yLimit;
  const yMax = yLimit;

  const ctx = canvas.getContext('2d');

  // segment coloring: green above 0, red below
  const segmentColor = (ctx) => {
    const p0 = ctx.p0?.parsed?.y;
    const p1 = ctx.p1?.parsed?.y;
    // if segment straddles zero, keep neutral? We'll color by average
    const avg = (p0 + p1) / 2;
    if (avg > 0.1) return '#0f7a3d';
    if (avg < -0.1) return '#b42318';
    return '#6b6560';
  };

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `Δ vs ${prevLabel}`,
          data: deltas,
          borderColor: '#0f7a3d',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 4,
          pointBackgroundColor: (c) => {
            const v = c.parsed?.y;
            if (v > 0) return '#0f7a3d';
            if (v < 0) return '#b42318';
            return '#6b6560';
          },
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          tension: 0.25,
          spanGaps: false,
          segment: {
            borderColor: segmentColor,
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#333',
          borderWidth: 1,
          padding: 8,
          cornerRadius: 4,
          displayColors: false,
          titleFont: { family: 'Inter, system-ui, sans-serif', size: 11, weight: '600' },
          bodyFont: { family: 'Inter, system-ui, sans-serif', size: 11 },
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex;
              const p = points[idx];
              const venue = p.venue === 'H' ? 'H' : 'A';
              const opp = p.opp.replace(' FC','').replace(' AFC','');
              const ft = p.ftCur ? `${p.ftCur[0]}–${p.ftCur[1]}` : '—';
              const ftPrev = p.ftPrev ? `${p.ftPrev[0]}–${p.ftPrev[1]}` : '—';
              return `Game ${p.x} · ${opp} ${venue} · ${ft} vs ${ftPrev}`;
            },
            label: (item) => {
              const idx = item.dataIndex;
              const p = points[idx];
              const sign = p.delta > 0 ? `+${p.delta}` : String(p.delta);
              return ` Δ ${sign} pts ( ${p.cumA} vs ${p.cumB} )`;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Game · ordered by ' + curLabel + ' fixtures', color: '#6b6560', font: { size: 9, family: 'Inter, system-ui, sans-serif' } },
          grid: { display: false },
          ticks: {
            color: '#6b6560',
            font: { size: 8 },
            maxTicksLimit: n > 30 ? 8 : Math.min(n, 8),
            callback: (val, idx) => {
              const v = labels[idx];
              if (v === 1 || v % 5 === 0) return String(v);
              return '';
            },
          },
          border: { display: false },
        },
        y: {
          min: yMin,
          max: yMax,
          title: { display: true, text: 'Points vs ' + prevLabel, color: '#6b6560', font: { size: 9 } },
          grid: {
            color: (c) => c.tick.value === 0 ? '#111' : '#e6e2de',
            lineWidth: (c) => c.tick.value === 0 ? 1 : 0.5,
            borderDash: (c) => c.tick.value === 0 ? [] : [2, 4],
            drawBorder: false,
          },
          ticks: {
            color: '#6b6560',
            font: { size: 8 },
            stepSize: yLimit <= 10 ? 5 : 10,
            callback: (v) => (v > 0 ? `+${v}` : String(v)),
          },
          border: { display: false },
        },
      },
      animation: false,
    },
  });

  // final value annotation similar to Datawrapper's +5.1% label
  const last = points[points.length - 1];
  if (last) {
    const plugin = {
      id: 'finalLabel',
      afterDatasetsDraw(chart) {
        const { ctx, scales } = chart;
        const xScale = scales.x;
        const yScale = scales.y;
        if (!xScale || !yScale) return;
        const x = xScale.getPixelForValue(last.x);
        const y = yScale.getPixelForValue(last.delta);
        ctx.save();
        ctx.font = '700 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = last.delta > 0 ? '#0f7a3d' : last.delta < 0 ? '#b42318' : '#6b6560';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const txt = `${last.delta > 0 ? '+' : ''}${last.delta}`;
        ctx.fillText(txt, x + 6, y);
        ctx.restore();
      },
    };
    // Register temporarily and update
    Chart.register(plugin);
    chartInstance.update();
    Chart.unregister(plugin);
  }
}

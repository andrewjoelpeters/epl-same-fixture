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
  canvas.style.height = '220px';
  canvas.style.display = 'block';
  host.appendChild(canvas);
  host.style.position = 'relative';
  host.style.height = '220px';
  if (window.matchMedia('(max-width:620px)').matches) {
    canvas.style.height = '200px';
    host.style.height = '200px';
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
          borderWidth: 2.2,
          pointRadius: 5,
          pointHoverRadius: 6,
          pointBackgroundColor: (c) => {
            const v = c.parsed?.y;
            if (v > 0) return '#0f7a3d';
            if (v < 0) return '#b42318';
            return '#6b6560';
          },
          pointBorderColor: '#fff',
          pointBorderWidth: 1.2,
          tension: 0.2,
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
          padding: 10,
          cornerRadius: 4,
          displayColors: false,
          titleFont: { family: 'Inter, system-ui, sans-serif', size: 13, weight: '600' },
          bodyFont: { family: 'Inter, system-ui, sans-serif', size: 13 },
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
          title: { display: true, text: 'Game', color: '#6b6560', font: { size: 11, family: 'Inter, system-ui, sans-serif', weight: '600' } },
          grid: { display: true, color: '#f0ece8', lineWidth: 0.6, drawTicks: false },
          ticks: {
            color: '#6b6560',
            font: { size: 11, family: 'Inter, system-ui, sans-serif' },
            maxTicksLimit: 38,
            autoSkip: false,
            callback: (val, idx) => {
              const v = labels[idx];
              // fixed 38 ticks, show every 1 on mobile? Show all 1..38 but sparse labels to avoid crowding: show 1 and every 5
              if (v === 1 || v % 2 === 0) return String(v);
              return '';
            },
          },
          border: { display: true, color: '#111', width: 0.8 },
        },
        y: {
          min: yMin,
          max: yMax,
          title: { display: true, text: 'Points vs ' + prevLabel, color: '#6b6560', font: { size: 11, family: 'Inter, system-ui, sans-serif', weight: '600' } },
          grid: {
            color: (c) => c.tick.value === 0 ? '#111' : '#e6e2de',
            lineWidth: (c) => c.tick.value === 0 ? 1 : 0.6,
            borderDash: (c) => c.tick.value === 0 ? [] : [2, 4],
            drawBorder: false,
          },
          ticks: {
            color: '#6b6560',
            font: { size: 11, family: 'Inter, system-ui, sans-serif' },
            stepSize: yLimit <= 10 ? 5 : 10,
            callback: (v) => (v > 0 ? `+${v}` : String(v)),
          },
          border: { display: false },
        },
      },
      animation: false,
    },
  });

  // right-side line label + final value like Datawrapper (+5.1%)
  const lastIdx = points.findLastIndex(p => p.delta !== null && p.delta !== undefined);
  const last = lastIdx >= 0 ? points[lastIdx] : null;
  if (last) {
    const plugin = {
      id: 'finalLabel',
      afterDatasetsDraw(chart) {
        const { ctx, scales, chartArea } = chart;
        const xScale = scales.x;
        const yScale = scales.y;
        if (!xScale || !yScale) return;
        const x = xScale.getPixelForValue(last.x);
        const y = yScale.getPixelForValue(last.delta);
        ctx.save();
        // value label
        ctx.font = '700 13px Inter, system-ui, sans-serif';
        ctx.fillStyle = last.delta > 0 ? '#0f7a3d' : last.delta < 0 ? '#b42318' : '#6b6560';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const txt = `${last.delta > 0 ? '+' : ''}${last.delta} pts`;
        ctx.fillText(txt, x + 8, y);
        // line label on far right edge
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = last.delta > 0 ? '#0f7a3d' : last.delta < 0 ? '#b42318' : '#6b6560';
        ctx.textAlign = 'left';
        const label = `Δ vs ${prevLabel}`;
        // draw at right edge, vertically centered at last y
        const rightX = chartArea.right + 4;
        // only draw if not overlapping chart
        if (x < chartArea.right - 20) {
          ctx.fillText(label, chartArea.right + 6, y);
        }
        ctx.restore();
      },
    };
    Chart.register(plugin);
    chartInstance.update();
    Chart.unregister(plugin);
  }
}

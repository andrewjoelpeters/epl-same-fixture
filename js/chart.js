import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let chartInstance = null;

// vertical difference plugin - draws thin line between cumA and cumB at each played x
const verticalDiffPlugin = {
  id: 'verticalDiff',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    const yScale = scales.y;
    const xScale = scales.x;
    const points = chart.data._rawPoints;
    if (!points || !yScale || !xScale) return;
    ctx.save();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p.isPlayed) continue;
      // only for games actually played where we have both cum values
      const yA = yScale.getPixelForValue(p.cumA);
      const yB = yScale.getPixelForValue(p.cumB);
      const x = xScale.getPixelForValue(i + 1); // x is game number 1..n
      if (yA == null || yB == null || isNaN(yA) || isNaN(yB)) continue;
      if (p.cumA === p.cumB) continue; // no difference
      const isPos = p.cumA > p.cumB;
      ctx.beginPath();
      ctx.moveTo(x, yA);
      ctx.lineTo(x, yB);
      ctx.strokeStyle = isPos ? '#0f7a3d' : '#b42318';
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.9;
      // subtle glow: draw thicker pale line underneath
      // Use low saturation: rely on hue already
      ctx.stroke();
      // small caps at ends
      ctx.beginPath();
      ctx.moveTo(x - 3, yA); ctx.lineTo(x + 3, yA);
      ctx.moveTo(x - 3, yB); ctx.lineTo(x + 3, yB);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
};
Chart.register(verticalDiffPlugin);

export function renderCumulativeChart(host, points, opts = {}) {
  const { maxY, curLabel = 'A', prevLabel = 'B' } = opts;
  host.innerHTML = '';
  if (!points || points.length === 0) {
    host.innerHTML = '<div style="padding:12px;color:#6b6560;font-size:12px">No data</div>';
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '180px';
  canvas.style.display = 'block';
  host.appendChild(canvas);
  host.style.position = 'relative';
  // ensure host height
  host.style.height = '180px';
  if (window.matchMedia('(max-width:620px)').matches) {
    canvas.style.height = '160px';
    host.style.height = '160px';
  }

  if (chartInstance) {
    try { chartInstance.destroy(); } catch {}
    chartInstance = null;
  }

  const n = points.length;
  const labels = points.map(p => p.x);

  const dataPrev = points.map(p => p.cumB);
  const dataCurActual = points.map(p => p.cumA);

  // Determine y max already passed as maxY
  const ctx = canvas.getContext('2d');

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: prevLabel,
          data: dataPrev,
          borderColor: '#6b6560',
          backgroundColor: 'transparent',
          borderWidth: 1.4,
          borderDash: [4, 3],
          pointRadius: 0,
          pointHoverRadius: 3,
          pointBackgroundColor: '#6b6560',
          tension: 0.15,
          spanGaps: false,
        },
        {
          label: curLabel,
          data: dataCurActual,
          borderColor: '#111',
          backgroundColor: 'transparent',
          borderWidth: 1.8,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointBackgroundColor: '#111',
          tension: 0.15,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'start',
          labels: {
            usePointStyle: true,
            pointStyle: 'line',
            boxWidth: 16,
            boxHeight: 2,
            font: { family: 'Inter, system-ui, sans-serif', size: 10 },
            color: '#6b6560',
            padding: 16,
          },
        },
        tooltip: {
          backgroundColor: '#111',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#333',
          borderWidth: 1,
          padding: 8,
          cornerRadius: 4,
          displayColors: true,
          boxPadding: 3,
          titleFont: { family: 'Inter, system-ui, sans-serif', size: 11, weight: '600' },
          bodyFont: { family: 'Inter, system-ui, sans-serif', size: 11 },
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex;
              const p = points[idx];
              const venue = p.venue === 'H' ? 'H' : 'A';
              const opp = p.opp.replace(' FC','').replace(' AFC','');
              const ft = p.ftCur ? `${p.ftCur[0]}–${p.ftCur[1]}` : '—';
              return `GW ${p.x} · ${opp} ${venue} · ${ft}`;
            },
            label: (item) => {
              const idx = item.dataIndex;
              const p = points[idx];
              const ds = item.datasetIndex;
              if (ds === 0) return ` ${prevLabel}: ${p.cumB} pts`;
              if (ds === 1) {
                const d = p.delta;
                const sign = d>0?`+${d}`:String(d);
                return ` ${curLabel}: ${p.cumA} pts (${sign})`;
              }
              return '';
            },
            filter: (item) => item.parsed.y !== null,
            labelPointStyle: () => ({ pointStyle: 'line', rotation: 0 }),
          },
        },
        verticalDiff: {},
      },
      scales: {
        x: {
          title: { display: true, text: 'Game', color: '#6b6560', font: { size: 9, family: 'Inter, system-ui, sans-serif' } },
          grid: { display: false },
          ticks: {
            color: '#6b6560',
            font: { size: 8 },
            maxTicksLimit: n > 30 ? 8 : 10,
            callback: (val, idx) => {
              const v = labels[idx];
              if (v % 5 === 0 || v === 1) return String(v);
              return '';
            },
          },
          border: { display: true, color: '#111' },
        },
        y: {
          min: 0,
          max: maxY,
          title: { display: true, text: 'Points', color: '#6b6560', font: { size: 9 } },
          grid: { color: '#e6e2de', drawBorder: false, lineWidth: 0.6, borderDash: [2,4] },
          ticks: {
            color: '#6b6560',
            font: { size: 8 },
            stepSize: maxY <= 20 ? 5 : 10,
            callback: (v) => String(v),
          },
          border: { display: false },
        },
      },
      animation: false,
    },
    plugins: [verticalDiffPlugin],
  });
  // store raw points for plugin
  chartInstance.data._rawPoints = points;
  chartInstance.update();
}

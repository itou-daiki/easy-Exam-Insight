// Association — discover linked struggle patterns
// =========================================================================
import { el, plotEl, renderTable, corr, fmtPct, fmtNum } from '../utils.js';
import { singlePicker } from '../picker.js';
import { ratioMatrix } from '../loader.js';
import { apriori } from '../ml.js';

export function render(container, state) {
  const wrap = el('div');
  let tdCurrent = null, mount;
  const refresh = () => {
    if (!tdCurrent) return;
    if (mount) mount.remove();
    mount = build(
      tdCurrent,
      parseFloat(thresInput.value),
      modeSel.value,
      parseFloat(supInput.value),
      parseFloat(confInput.value),
      parseFloat(liftInput.value),
      parseFloat(corrInput.value)
    );
    wrap.appendChild(mount);
  };
  wrap.appendChild(singlePicker(state, td => { tdCurrent = td; refresh(); }));

  const controls = el('div', { class: 'form-row' });
  const thresInput = el('input', { type: 'number', step: 0.05, min: 0.1, max: 0.9, value: 0.6, style: { width: '80px' } });
  const modeSel = el('select');
  modeSel.appendChild(el('option', { value: 'low' }, '苦手 (得点率 < 閾値)'));
  modeSel.appendChild(el('option', { value: 'high' }, '得意 (得点率 ≥ 閾値)'));
  const supInput = el('input', { type: 'number', step: 0.01, min: 0.05, max: 0.6, value: 0.15, style: { width: '80px' } });
  const confInput = el('input', { type: 'number', step: 0.05, min: 0.3, max: 0.99, value: 0.6, style: { width: '80px' } });
  const liftInput = el('input', { type: 'number', step: 0.1, min: 1.0, max: 3.0, value: 1.2, style: { width: '80px' } });
  const corrInput = el('input', { type: 'number', step: 0.05, min: 0.0, max: 0.95, value: 0.3, style: { width: '80px' } });

  controls.appendChild(el('label', null, '閾値', thresInput));
  controls.appendChild(el('label', null, '対象', modeSel));
  controls.appendChild(el('label', null, '最小支持度', supInput));
  controls.appendChild(el('label', null, '最小確信度', confInput));
  controls.appendChild(el('label', null, '最小リフト', liftInput));
  controls.appendChild(el('label', null, 'NW相関閾値', corrInput));
  controls.appendChild(el('button', { class: 'btn primary', onclick: refresh },
    el('i', { class: 'fas fa-sync' }), ' 再計算'));
  wrap.appendChild(controls);

  container.appendChild(wrap);
}

function build(td, threshold, mode, minSup, minConf, minLift, corrThres) {
  const out = el('div');
  if (td.items.length < 2) {
    out.appendChild(el('div', { class: 'callout warn' }, '小問が2つ以上必要です'));
    return out;
  }
  const ratios = ratioMatrix(td);
  const itemNames = td.items.map(i => i.name);

  const transactions = ratios.map(row => {
    const t = new Set();
    row.forEach((v, j) => {
      if (!Number.isFinite(v)) return;
      if (mode === 'low' && v < threshold) t.add(itemNames[j]);
      else if (mode === 'high' && v >= threshold) t.add(itemNames[j]);
    });
    return t;
  });
  const label = mode === 'low' ? '苦手' : '得意';

  out.appendChild(el('h3', null, `🔥 ${label}項目同士の同時発生数`));
  const N = itemNames.length;
  const co = Array.from({ length: N }, () => new Array(N).fill(0));
  for (const t of transactions) {
    const arr = [...t];
    for (const a of arr) for (const b of arr) {
      if (a === b) continue;
      const i = itemNames.indexOf(a), j = itemNames.indexOf(b);
      co[i][j] += 1;
    }
  }
  out.appendChild(plotEl(
    [{
      type: 'heatmap',
      z: co, x: itemNames, y: itemNames,
      text: co, texttemplate: '%{text}',
      colorscale: 'Reds',
      colorbar: { title: `両方${label}` },
    }],
    { height: 100 + N * 32, margin: { l: 110, r: 40, t: 20, b: 110 } }
  ));

  out.appendChild(el('h3', null, `📜 アソシエーション・ルール（${label}）`));
  const { rules } = apriori(transactions, minSup, 3);
  const filtered = rules.filter(r => r.confidence >= minConf && r.lift >= minLift);
  if (!filtered.length) {
    out.appendChild(el('div', { class: 'callout warn' },
      '条件を満たすルールがありません — 閾値を緩めてください'));
  } else {
    const rows = filtered.slice(0, 50).map(r => [
      r.ant.join(' & '),
      r.cons.join(' & '),
      fmtPct(r.support),
      fmtPct(r.confidence),
      fmtNum(r.lift, 2),
      r.count,
    ]);
    out.appendChild(renderTable(
      [`前提(${label})`, `結論(${label})`, '支持度', '確信度', 'リフト', '人数'],
      rows
    ));
    out.appendChild(el('p', { class: 'muted' },
      `読み方: 「前提が${label}の生徒のうち、確信度% が結論も${label}」。リフトが大きいほど偶然では説明できない強い連関。`));
  }

  out.appendChild(el('h3', null, '🔗 項目相関ネットワーク'));
  const corrM = Array.from({ length: N }, () => new Array(N).fill(NaN));
  for (let i = 0; i < N; i++) for (let j = i; j < N; j++) {
    if (i === j) { corrM[i][j] = 1; continue; }
    const a = td.rows.map(r => r[itemNames[i]]);
    const b = td.rows.map(r => r[itemNames[j]]);
    const r = corr(a, b);
    corrM[i][j] = corrM[j][i] = r;
  }
  const edges = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const r = corrM[i][j];
    if (Number.isFinite(r) && Math.abs(r) >= corrThres) edges.push({ a: i, b: j, r });
  }
  if (!edges.length) {
    out.appendChild(el('div', { class: 'callout info' }, 'NW相関閾値を下げてください — エッジがありません'));
  } else {
    const angles = itemNames.map((_, i) => (2 * Math.PI * i) / N);
    const xs = angles.map(a => Math.cos(a));
    const ys = angles.map(a => Math.sin(a));
    const edgeX = [], edgeY = [];
    for (const e of edges) {
      edgeX.push(xs[e.a], xs[e.b], null);
      edgeY.push(ys[e.a], ys[e.b], null);
    }
    out.appendChild(plotEl(
      [
        {
          x: edgeX, y: edgeY, mode: 'lines', type: 'scatter',
          line: { color: '#94a3b8', width: 1.5 }, hoverinfo: 'skip', showlegend: false,
        },
        {
          x: xs, y: ys, mode: 'markers+text', type: 'scatter',
          text: itemNames, textposition: 'top center',
          marker: { size: 28, color: '#1e90ff', line: { color: '#fff', width: 2 } },
          showlegend: false,
        },
      ],
      {
        xaxis: { visible: false }, yaxis: { visible: false },
        height: 540, margin: { l: 20, r: 20, t: 30, b: 20 },
      }
    ));
    const edgeRows = edges.slice().sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).map(e => [
      itemNames[e.a], itemNames[e.b], fmtNum(e.r, 3),
    ]);
    out.appendChild(renderTable(['項目A', '項目B', '相関係数'], edgeRows));
  }

  return out;
}

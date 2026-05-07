// Clustering — discover learner archetypes
// =========================================================================
import { el, kpi, plotEl, renderTable, mean, fmtPct, fmtNum } from '../utils.js?v=3';
import { singlePicker } from '../picker.js?v=3';
import { ratioMatrix } from '../loader.js?v=3';
import { kmeans, pca2, standardize } from '../ml.js?v=3';

const PALETTE = ['#1e90ff', '#ef4444', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#84cc16'];

export function render(container, state) {
  const wrap = el('div');
  let tdCurrent = null;
  let mount;
  const refresh = () => {
    if (!tdCurrent) return;
    if (mount) mount.remove();
    mount = build(tdCurrent, +kInput.value, std.checked);
    wrap.appendChild(mount);
  };
  wrap.appendChild(singlePicker(state, td => { tdCurrent = td; refresh(); }));

  const controls = el('div', { class: 'form-row' });
  const kInput = el('input', { type: 'number', min: 2, max: 8, value: 4, style: { width: '70px' } });
  const std = el('input', { type: 'checkbox', checked: 'checked' });
  controls.appendChild(el('label', null, 'クラスタ数 k', kInput));
  controls.appendChild(el('label', null, '標準化', std));
  controls.appendChild(el('button', { class: 'btn primary', onclick: refresh },
    el('i', { class: 'fas fa-play' }), ' 再実行'));
  wrap.appendChild(controls);

  container.appendChild(wrap);
}

function build(td, k, doStd) {
  const out = el('div');
  if (td.items.length < 2) {
    out.appendChild(el('div', { class: 'callout warn' }, '小問が2つ以上必要です'));
    return out;
  }

  const items = td.items;
  const itemNames = items.map(i => i.name);
  const ratiosFull = ratioMatrix(td);
  const validIdx = ratiosFull.map((r, i) => r.every(Number.isFinite) ? i : -1).filter(i => i >= 0);
  if (validIdx.length < 4) {
    out.appendChild(el('div', { class: 'callout warn' }, '欠損なしの生徒が少なすぎます'));
    return out;
  }
  const X = validIdx.map(i => ratiosFull[i]);
  const Xstd = doStd ? standardize(X) : X;
  const { labels, inertia } = kmeans(Xstd, k);

  out.appendChild(el('h3', null, '📉 エルボー法（k の目安）'));
  const ks = [], inertias = [];
  for (let kk = 2; kk <= Math.min(8, X.length - 1); kk++) {
    ks.push(kk);
    inertias.push(kmeans(Xstd, kk).inertia);
  }
  out.appendChild(plotEl(
    [{ x: ks, y: inertias, type: 'scatter', mode: 'lines+markers', line: { color: '#1e90ff' } }],
    { xaxis: { title: 'クラスタ数 k', dtick: 1 }, yaxis: { title: 'inertia' }, height: 280, margin: { t: 20 } }
  ));

  const sizes = new Map();
  for (const l of labels) sizes.set(l, (sizes.get(l) || 0) + 1);
  out.appendChild(el('div', { class: 'kpi-row' },
    kpi('使用したk', k),
    kpi('対象生徒数', validIdx.length),
    kpi('inertia', fmtNum(inertia, 2)),
  ));

  out.appendChild(el('h3', null, '📊 クラスタ別プロファイル（平均得点率）'));
  const traces = [];
  const sortedClusters = [...sizes.keys()].sort((a, b) => a - b);
  for (const c of sortedClusters) {
    const subset = X.filter((_, i) => labels[i] === c);
    const m = itemNames.map((_, j) => mean(subset.map(r => r[j])));
    traces.push({
      type: 'scatterpolar',
      r: [...m, m[0]],
      theta: [...itemNames, itemNames[0]],
      fill: 'toself',
      name: `C${c} (n=${sizes.get(c)})`,
      line: { color: PALETTE[c % PALETTE.length] },
      opacity: 0.55,
    });
  }
  out.appendChild(plotEl(
    traces,
    { polar: { radialaxis: { visible: true, range: [0, 1] } }, height: 520, margin: { t: 30 } }
  ));

  out.appendChild(el('h3', null, '🏷️ クラスタ命名候補'));
  const namingRows = [];
  for (const c of sortedClusters) {
    const subset = X.filter((_, i) => labels[i] === c);
    const m = itemNames.map((_, j) => mean(subset.map(r => r[j])));
    const sortedJ = m.map((v, j) => ({ v, j })).sort((a, b) => a.v - b.v);
    const weak = sortedJ.slice(0, 2).map(x => itemNames[x.j]);
    const strong = sortedJ.slice(-2).reverse().map(x => itemNames[x.j]);
    const overall = mean(m);
    const summary = overall >= 0.7 ? '高得点層' : (overall <= 0.4 ? '低得点層（要支援）' : '中位層');
    namingRows.push([
      `C${c}`,
      sizes.get(c),
      fmtPct(overall),
      strong.join(' / '),
      weak.join(' / '),
      { v: summary, cls: overall <= 0.4 ? 'bad' : (overall >= 0.7 ? 'good' : '') },
    ]);
  }
  out.appendChild(renderTable(
    ['クラスタ', '人数', '平均得点率', '強み(top2)', '弱み(bottom2)', 'サマリー'],
    namingRows,
  ));

  out.appendChild(el('h3', null, '🗺️ PCA 2次元プロット'));
  const { xy, varRatio } = pca2(Xstd);
  const traces2 = sortedClusters.map(c => {
    const idxs = labels.map((l, i) => l === c ? i : -1).filter(i => i >= 0);
    return {
      x: idxs.map(i => xy[i][0]),
      y: idxs.map(i => xy[i][1]),
      mode: 'markers',
      type: 'scatter',
      name: `C${c}`,
      marker: { size: 9, color: PALETTE[c % PALETTE.length], opacity: 0.8 },
      text: idxs.map(i => {
        const r = td.rows[validIdx[i]];
        return `${r['氏名'] || ''} (クラス${r['クラス'] || '?'})`;
      }),
      hoverinfo: 'text',
    };
  });
  out.appendChild(plotEl(
    traces2,
    {
      xaxis: { title: `PC1 (${(varRatio[0] * 100).toFixed(1)}%)` },
      yaxis: { title: `PC2 (${(varRatio[1] * 100).toFixed(1)}%)` },
      height: 480, margin: { t: 20 },
    }
  ));

  out.appendChild(el('h3', null, '👥 クラスタ別 生徒一覧'));
  const tabs = el('div', { class: 'tabs' });
  const panes = el('div');
  sortedClusters.forEach((c, idx) => {
    const btn = el('button', { class: 'tab-btn' + (idx === 0 ? ' active' : ''), type: 'button' }, `C${c} (n=${sizes.get(c)})`);
    const pane = el('div', { class: 'tab-pane' + (idx === 0 ? ' active' : '') });
    const members = labels.map((l, i) => l === c ? validIdx[i] : -1).filter(i => i >= 0);
    const rows = members.map(i => {
      const r = td.rows[i];
      return [
        r['生徒管理コード'] || '—',
        r['氏名'] || '—',
        r['クラス'] ?? '—',
        r['番号'] ?? '—',
        r['合計点'] ?? '—',
      ];
    });
    rows.sort((a, b) => (b[4] || 0) - (a[4] || 0));
    pane.appendChild(renderTable(['生徒管理コード', '氏名', 'クラス', '番号', '合計点'], rows));
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      panes.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active'); pane.classList.add('active');
    });
    tabs.appendChild(btn);
    panes.appendChild(pane);
  });
  out.appendChild(tabs);
  out.appendChild(panes);

  return out;
}

// Item analysis (Classical Test Theory)
// =========================================================================
import { el, kpi, plotEl, renderTable, mean, stdev, corr, cronbachAlpha, fmtNum, downloadXLSX } from '../utils.js?v=4';
import { singlePicker } from '../picker.js?v=4';
import { explain, helpBox, howToRead } from '../help.js?v=4';

export function render(container, state) {
  const wrap = el('div');
  let mount;
  wrap.appendChild(singlePicker(state, td => {
    if (mount) mount.remove();
    mount = build(td);
    wrap.appendChild(mount);
  }));
  container.appendChild(wrap);
}

function build(td) {
  const out = el('div');
  if (!td.items.length) {
    out.appendChild(el('div', { class: 'callout warn' }, '小問データがありません'));
    return out;
  }
  const df = td.rows;
  const itemNames = td.items.map(i => i.name);

  const matrix = df.map(r => itemNames.map(c => r[c]));
  const completeMatrix = matrix.filter(r => r.every(Number.isFinite));
  const total = matrix.map(row => row.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0));

  const itc = {};
  for (const c of itemNames) {
    const x = df.map(r => r[c]);
    const rest = df.map((r, i) => total[i] - (Number.isFinite(r[c]) ? r[c] : 0));
    itc[c] = corr(x, rest);
  }

  const n = df.length;
  const cutoff = Math.max(1, Math.round(0.27 * n));
  const sortedIdx = total.map((_, i) => i).sort((a, b) => total[b] - total[a]);
  const upper = new Set(sortedIdx.slice(0, cutoff));
  const lower = new Set(sortedIdx.slice(-cutoff));
  const d_index = {};
  for (const c of itemNames) {
    const u = df.filter((_, i) => upper.has(i)).map(r => r[c]).filter(Number.isFinite);
    const l = df.filter((_, i) => lower.has(i)).map(r => r[c]).filter(Number.isFinite);
    const maxC = Math.max(...df.map(r => r[c]).filter(Number.isFinite), 1);
    d_index[c] = (mean(u) - mean(l)) / maxC;
  }

  const alpha = cronbachAlpha(completeMatrix);

  out.appendChild(el('div', { class: 'callout info' },
    el('strong', null, '📐 項目分析（CTT）でわかること'),
    el('br'),
    'テストの「設問の良し悪し」「テスト全体の信頼性」を客観的に評価します。',
    'どの問題を次回出題し続けるべきか、どの問題を見直すべきかが分かります。'
  ));

  out.appendChild(el('div', { class: 'kpi-row' },
    kpi('Cronbach α', Number.isFinite(alpha) ? alpha.toFixed(3) : '—', '0.7以上が望ましい'),
    kpi('項目数', td.items.length),
    kpi('有効回答者', completeMatrix.length),
    kpi('総得点 平均', fmtNum(mean(total), 2)),
    kpi('総得点 SD', fmtNum(stdev(total), 2)),
  ));

  out.appendChild(explain('alpha'));

  out.appendChild(el('h3', null, '📋 項目分析テーブル'));
  const hasUnits = td.items.some(it => it.unit_name);
  const rows = td.items.map(it => {
    const v = df.map(r => r[it.name]).filter(Number.isFinite);
    const denom = it.max_score || Math.max(...v, 1);
    const p = mean(v) / denom;
    const r = itc[it.name];
    const d = d_index[it.name];
    return [
      it.name,
      ...(hasUnits ? [it.unit_name || '—'] : []),
      it.domain || '—',
      it.max_score || '—',
      fmtNum(mean(v), 2),
      fmtNum(stdev(v), 2),
      { v: fmtNum(p, 3), cls: p < 0.3 ? 'warn' : (p > 0.85 ? 'good' : '') },
      { v: fmtNum(r, 3), cls: !Number.isFinite(r) ? '' : (r < 0.2 ? 'bad' : (r >= 0.4 ? 'good' : '')) },
      { v: fmtNum(d, 3), cls: !Number.isFinite(d) ? '' : (d < 0.2 ? 'bad' : (d >= 0.4 ? 'good' : '')) },
    ];
  });
  out.appendChild(renderTable(
    ['項目', ...(hasUnits ? ['単元'] : []), '領域', '配点', '平均', 'SD', '困難度 p', '項目-合計相関', 'D指数'],
    rows,
  ));
  out.appendChild(el('div', { class: 'callout info' },
    '📌 ',
    el('strong', null, '困難度 p'),
    ': 0.3未満=難しすぎ、0.85超=易しすぎ。 ',
    el('strong', null, '識別力 (相関/D)'),
    ': 0.2未満=弱い（出題改善候補）、0.4以上=良問。'
  ));
  out.appendChild(explain('difficulty'));
  out.appendChild(explain('discrimination'));

  out.appendChild(el('h3', null, '🎯 困難度 × 識別力 マップ'));
  out.appendChild(explain('classification'));
  const xs = [], ys = [], lbls = [], col = [];
  for (const it of td.items) {
    const v = df.map(r => r[it.name]).filter(Number.isFinite);
    const denom = it.max_score || Math.max(...v, 1);
    const p = mean(v) / denom;
    const r = itc[it.name];
    if (!Number.isFinite(p) || !Number.isFinite(r)) continue;
    xs.push(p); ys.push(r); lbls.push(it.name);
    col.push(p >= 0.3 && p <= 0.85 && r >= 0.4 ? '#10b981' : (r < 0.2 ? '#ef4444' : '#f59e0b'));
  }
  out.appendChild(plotEl(
    [{
      x: xs, y: ys, mode: 'markers+text', type: 'scatter',
      text: lbls, textposition: 'top center',
      marker: { size: 14, color: col, line: { color: '#fff', width: 2 } },
    }],
    {
      xaxis: { title: '困難度 p', range: [0, 1] },
      yaxis: { title: '項目-合計相関', range: [-0.2, 1] },
      shapes: [
        { type: 'line', x0: 0, x1: 1, y0: 0.4, y1: 0.4, line: { color: '#10b981', dash: 'dot', width: 2 } },
        { type: 'line', x0: 0, x1: 1, y0: 0.2, y1: 0.2, line: { color: '#ef4444', dash: 'dot', width: 2 } },
        { type: 'rect', x0: 0, x1: 0.3, y0: -0.2, y1: 1, fillcolor: 'rgba(245,158,11,0.06)', line: { width: 0 } },
        { type: 'rect', x0: 0.85, x1: 1, y0: -0.2, y1: 1, fillcolor: 'rgba(59,130,246,0.06)', line: { width: 0 } },
      ],
      annotations: [
        { x: 0.15, y: 0.95, text: '難しすぎ', showarrow: false, font: { color: '#92400e' } },
        { x: 0.92, y: 0.95, text: '易しすぎ', showarrow: false, font: { color: '#1e3a8a' } },
        { x: 0.55, y: 0.7, text: '良問ゾーン', showarrow: false, font: { color: '#065f46', size: 14 } },
      ],
      height: 480, margin: { t: 20 },
    }
  ));

  out.appendChild(el('h3', null, '🧪 α-if-deleted（その項目を除いたときの α）'));
  out.appendChild(explain('alphaIfDeleted'));
  const deletedRows = [];
  for (const c of itemNames) {
    const restCols = itemNames.filter(x => x !== c);
    const m = df.map(r => restCols.map(rc => r[rc])).filter(r => r.every(Number.isFinite));
    const a = cronbachAlpha(m);
    deletedRows.push([
      c,
      { v: fmtNum(a, 3), cls: Number.isFinite(a) && Number.isFinite(alpha) && a > alpha ? 'warn' : '' },
    ]);
  }
  out.appendChild(renderTable(['項目', 'α-if-deleted'], deletedRows));
  out.appendChild(el('p', { class: 'muted' }, '値が現在の α を上回る項目（黄色）は、削除すると信頼性が上がる候補です。'));

  out.appendChild(el('div', { class: 'form-row' },
    el('button', {
      class: 'btn primary',
      onclick: () => downloadXLSX(`item_analysis_${td.test_id}.xlsx`, {
        '項目分析': {
          headers: ['項目', ...(hasUnits ? ['単元'] : []), '領域', '配点', '平均', 'SD', '困難度 p', '項目-合計相関', 'D指数'],
          rows,
        },
      }),
    }, el('i', { class: 'fas fa-download' }), ' Excelダウンロード')
  ));

  return out;
}

// Overview / EDA — distributions, class comparisons, item heatmap
// =========================================================================
import { el, kpi, plotEl, renderTable, makeTabs, mean, median, stdev, fmtNum } from '../utils.js?v=3';
import { singlePicker } from '../picker.js?v=3';

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
  const df = td.rows;

  const totals = df.map(r => r['合計点']).filter(Number.isFinite);
  const classes = new Set(df.map(r => r['クラス']).filter(v => v != null));

  out.appendChild(el('div', { class: 'kpi-row' },
    kpi('生徒数', df.length),
    kpi('クラス数', classes.size),
    kpi('小問数', td.items.length),
    kpi('平均合計点', totals.length ? fmtNum(mean(totals), 1) : '—'),
    kpi('中央値合計点', totals.length ? fmtNum(median(totals), 1) : '—'),
    kpi('SD合計点', totals.length ? fmtNum(stdev(totals), 2) : '—'),
  ));

  out.appendChild(el('h3', null, '📊 要約統計'));
  const cols = [...td.domain_cols, ...td.items.map(i => i.name)];
  const summaryRows = cols.map(c => {
    const v = df.map(r => r[c]).filter(Number.isFinite);
    return [
      c,
      v.length,
      fmtNum(mean(v), 2),
      fmtNum(median(v), 2),
      fmtNum(stdev(v), 2),
      v.length ? fmtNum(Math.min(...v), 2) : '—',
      v.length ? fmtNum(Math.max(...v), 2) : '—',
    ];
  });
  out.appendChild(renderTable(['項目', 'N', '平均', '中央値', 'SD', 'Min', 'Max'], summaryRows));

  if (totals.length) {
    out.appendChild(el('h3', null, '📈 合計点の分布'));
    out.appendChild(makeTabs([
      {
        label: 'ヒストグラム',
        render: () => plotEl(
          [{ x: totals, type: 'histogram', marker: { color: '#1e90ff' }, nbinsx: 20 }],
          { xaxis: { title: '合計点' }, yaxis: { title: '人数' }, height: 380, margin: { t: 20 } }
        ),
      },
      {
        label: 'クラス別ボックス',
        render: () => {
          if (!classes.size) return el('div', { class: 'callout info' }, 'クラス情報がありません');
          const traces = [...classes].sort().map(c => ({
            type: 'box',
            y: df.filter(r => r['クラス'] === c).map(r => r['合計点']).filter(Number.isFinite),
            name: `クラス${c}`, boxpoints: 'all', jitter: 0.3, pointpos: 0,
          }));
          return plotEl(traces, { yaxis: { title: '合計点' }, height: 420, margin: { t: 20 } });
        },
      },
      {
        label: 'クラス別バイオリン',
        render: () => {
          if (!classes.size) return el('div', { class: 'callout info' }, 'クラス情報がありません');
          const traces = [...classes].sort().map(c => ({
            type: 'violin',
            y: df.filter(r => r['クラス'] === c).map(r => r['合計点']).filter(Number.isFinite),
            name: `クラス${c}`, box: { visible: true }, meanline: { visible: true }, points: 'all',
          }));
          return plotEl(traces, { yaxis: { title: '合計点' }, height: 420, margin: { t: 20 } });
        },
      },
    ]));
  }

  out.appendChild(el('h3', null, '🔠 小問ごとの分布'));
  const grid = el('div', { class: 'plot-grid' });
  for (const it of td.items) {
    const vals = df.map(r => r[it.name]).filter(Number.isFinite);
    if (!vals.length) continue;
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const nbins = Math.max(5, Math.min(20, Math.ceil(maxV - minV + 1)));
    grid.appendChild(plotEl(
      [{ x: vals, type: 'histogram', marker: { color: '#06b6d4' }, nbinsx: nbins }],
      {
        title: { text: `${it.name}${it.max_score ? ` (配点 ${it.max_score})` : ''}`, font: { size: 13 } },
        height: 240, margin: { l: 40, r: 20, t: 36, b: 32 },
      }
    ));
  }
  out.appendChild(grid);

  if (classes.size && td.items.length) {
    out.appendChild(el('h3', null, '🌡️ クラス × 項目 平均得点率ヒートマップ'));
    const classList = [...classes].sort();
    const z = [], txt = [];
    for (const c of classList) {
      const row = [], trow = [];
      for (const it of td.items) {
        const denom = it.max_score || Math.max(...df.map(r => r[it.name]).filter(Number.isFinite), 1);
        const subset = df.filter(r => r['クラス'] === c).map(r => r[it.name]).filter(Number.isFinite);
        const rate = subset.length ? mean(subset) / denom : NaN;
        row.push(rate);
        trow.push(Number.isFinite(rate) ? `${(rate * 100).toFixed(1)}%` : '—');
      }
      z.push(row);
      txt.push(trow);
    }
    out.appendChild(plotEl(
      [{
        type: 'heatmap',
        z, x: td.items.map(i => i.name), y: classList.map(c => `クラス${c}`),
        text: txt, texttemplate: '%{text}',
        colorscale: 'RdYlGn', zmin: 0, zmax: 1,
        colorbar: { title: '得点率' },
      }],
      { height: 100 + classList.length * 50, margin: { l: 70, r: 40, t: 20, b: 80 } }
    ));
    out.appendChild(el('p', { class: 'muted' }, '配点が不明な項目は観測最大値で正規化しています。緑=得点率高、赤=低。'));
  }

  const domainOnly = td.domain_cols.filter(c => c !== '合計点');
  if (domainOnly.length >= 2) {
    out.appendChild(el('h3', null, '🎯 領域ごとの相関（散布図）'));
    const a = domainOnly[0], b = domainOnly[1];
    out.appendChild(plotEl(
      [{
        x: df.map(r => r[a]),
        y: df.map(r => r[b]),
        mode: 'markers', type: 'scatter',
        marker: {
          size: 8, opacity: 0.65,
          color: df.map(r => r['クラス'] || 0),
          colorscale: 'Viridis', showscale: classes.size > 1, colorbar: { title: 'クラス' },
        },
        text: df.map(r => `${r['氏名'] || ''} (クラス${r['クラス'] || '?'})`),
        hoverinfo: 'x+y+text',
      }],
      { xaxis: { title: a }, yaxis: { title: b }, height: 460, margin: { t: 20 } }
    ));
  }

  return out;
}

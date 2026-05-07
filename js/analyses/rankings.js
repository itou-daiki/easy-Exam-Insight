// Rankings — TOP / WORST / MID 20 plus per-class and per-domain rankings
// =========================================================================
import { el, kpi, plotEl, renderTable, mean, fmtPct, fmtNum, downloadXLSX } from '../utils.js?v=5';
import { singlePicker } from '../picker.js?v=5';
import { helpBox } from '../help.js?v=5';

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
  if (!td.rows.length) {
    out.appendChild(el('div', { class: 'callout warn' }, 'データがありません'));
    return out;
  }

  out.appendChild(el('div', { class: 'callout info' },
    el('strong', null, '🏆 ランキング機能'),
    el('br'),
    '合計点・領域別（知/思）・小問別の TOP20 / WORST20 / 中間20 を一覧表示。',
    el('br'),
    'クラス内・学年内のランキング、そしてクラス対抗の平均ランキングまで網羅。'
  ));

  const anonymize = !!window._appState?.anonymize;
  const anonName = (r, idx) => anonymize
    ? `生徒${String.fromCharCode(65 + (idx % 26))}${idx >= 26 ? Math.floor(idx / 26) : ''}`
    : (r['氏名'] || '—');

  const rowsAnnotated = td.rows.map((r, idx) => ({ r, idx, name: anonName(r, idx) }));

  const totals = rowsAnnotated.filter(x => Number.isFinite(x.r['合計点']))
    .map(x => ({ ...x, score: x.r['合計点'] }))
    .sort((a, b) => b.score - a.score);

  out.appendChild(el('div', { class: 'kpi-row' },
    kpi('対象生徒', td.rows.length),
    kpi('平均合計点', fmtNum(mean(totals.map(x => x.score)), 1)),
    kpi('最高点', totals.length ? totals[0].score : '—',
        totals.length ? totals[0].name : ''),
    kpi('最低点', totals.length ? totals[totals.length - 1].score : '—',
        totals.length ? totals[totals.length - 1].name : ''),
  ));

  out.appendChild(el('h3', null, '🥇 合計点 TOP 20'));
  out.appendChild(makeRankTable(totals.slice(0, 20), 'good'));

  out.appendChild(el('h3', null, '⚠️ 合計点 WORST 20（要支援）'));
  const worst = totals.slice(-20).reverse();
  out.appendChild(makeRankTable(worst, 'bad', totals.length));

  if (totals.length > 40) {
    out.appendChild(el('h3', null, '📊 合計点 中間20名'));
    const mid = Math.floor(totals.length / 2);
    out.appendChild(makeRankTable(totals.slice(mid - 10, mid + 10), ''));
  }

  const domainCols = (td.domain_cols || []).filter(c => c !== '合計点');
  for (const col of domainCols) {
    const max = (td.domain_max_scores && td.domain_max_scores[col]) ||
                Math.max(...td.rows.map(r => r[col]).filter(Number.isFinite), 1);
    const dRows = rowsAnnotated.filter(x => Number.isFinite(x.r[col]))
      .map(x => ({ ...x, score: x.r[col], rate: x.r[col] / max }))
      .sort((a, b) => b.score - a.score);
    if (!dRows.length) continue;

    out.appendChild(el('h3', null, `🎯 「${col}」 TOP 20`));
    out.appendChild(makeDomainTable(dRows.slice(0, 20), col, 'good'));
    out.appendChild(el('h3', null, `🎯 「${col}」 WORST 20`));
    out.appendChild(makeDomainTable(dRows.slice(-20).reverse(), col, 'bad', dRows.length));
  }

  if (td.items.length) {
    out.appendChild(el('h3', null, '🔠 小問別 TOP/WORST 5（参考）'));
    out.appendChild(el('p', { class: 'muted' },
      '各小問で最も得点した／取れなかった生徒。指導の振り返りに。'));
    const itemPanels = el('div', { class: 'plot-grid' });
    for (const it of td.items) {
      const max = it.max_score || Math.max(...td.rows.map(r => r[it.name]).filter(Number.isFinite), 1);
      const sorted = rowsAnnotated.filter(x => Number.isFinite(x.r[it.name]))
        .map(x => ({ ...x, score: x.r[it.name], rate: x.r[it.name] / max }))
        .sort((a, b) => b.score - a.score);
      if (!sorted.length) continue;
      const panel = el('div');
      const label = it.unit_name ? `${it.unit_name}（${it.name}）` : it.name;
      panel.appendChild(el('h4', null, label));
      panel.appendChild(renderTable(
        ['順位', '氏名', '得点', '得点率'],
        sorted.slice(0, 5).map((x, i) => [
          `${i + 1}位`, x.name, x.score,
          { v: fmtPct(x.rate), cls: 'good' },
        ])
      ));
      panel.appendChild(el('div', {
        style: { fontSize: '0.85rem', color: '#64748b', marginTop: '0.4rem' }
      }, '↓ WORST 5'));
      panel.appendChild(renderTable(
        ['順位', '氏名', '得点', '得点率'],
        sorted.slice(-5).reverse().map((x, i) => [
          `下から${i + 1}位`, x.name, x.score,
          { v: fmtPct(x.rate), cls: 'bad' },
        ])
      ));
      itemPanels.appendChild(panel);
    }
    out.appendChild(itemPanels);
  }

  if (td.rows[0] && 'クラス' in td.rows[0]) {
    const classes = [...new Set(td.rows.map(r => r['クラス']).filter(v => v != null))].sort();
    if (classes.length >= 2) {
      out.appendChild(el('h3', null, '🏫 クラス別 平均得点ランキング'));
      const classData = classes.map(c => {
        const subset = td.rows.filter(r => r['クラス'] === c);
        const tot = subset.map(r => r['合計点']).filter(Number.isFinite);
        return {
          cls: c, n: subset.length, mean: mean(tot),
          max: tot.length ? Math.max(...tot) : NaN,
          min: tot.length ? Math.min(...tot) : NaN,
        };
      }).sort((a, b) => b.mean - a.mean);

      out.appendChild(renderTable(
        ['順位', 'クラス', '人数', '平均', '最高', '最低'],
        classData.map((c, i) => [
          `${i + 1}位`,
          `クラス${c.cls}`,
          c.n,
          { v: fmtNum(c.mean, 1), cls: i === 0 ? 'good' : (i === classData.length - 1 ? 'bad' : '') },
          fmtNum(c.max, 1),
          fmtNum(c.min, 1),
        ])
      ));

      out.appendChild(plotEl(
        [{
          type: 'bar',
          x: classData.map(c => `クラス${c.cls}`),
          y: classData.map(c => c.mean),
          marker: {
            color: classData.map((_, i) =>
              i === 0 ? '#10b981' : (i === classData.length - 1 ? '#ef4444' : '#1e90ff'))
          },
          text: classData.map(c => fmtNum(c.mean, 1)),
          textposition: 'outside',
        }],
        { yaxis: { title: '平均合計点' }, height: 320, margin: { t: 20 } }
      ));

      out.appendChild(el('h3', null, '🥇 各クラス TOP3 / WORST3'));
      const perClass = el('div', { class: 'plot-grid' });
      for (const c of classes) {
        const subset = totals.filter(x => x.r['クラス'] === c);
        if (!subset.length) continue;
        const panel = el('div');
        panel.appendChild(el('h4', null, `クラス${c}`));
        panel.appendChild(renderTable(
          ['順位', '氏名', '合計点'],
          subset.slice(0, 3).map((x, i) => [
            `${i + 1}位`, x.name,
            { v: x.score, cls: 'good' },
          ])
        ));
        panel.appendChild(el('div', {
          style: { fontSize: '0.85rem', color: '#64748b', marginTop: '0.4rem' }
        }, '↓ クラス内 WORST 3'));
        panel.appendChild(renderTable(
          ['順位', '氏名', '合計点'],
          subset.slice(-3).reverse().map((x, i) => [
            `下から${i + 1}位`, x.name,
            { v: x.score, cls: 'bad' },
          ])
        ));
        perClass.appendChild(panel);
      }
      out.appendChild(perClass);
    }
  }

  out.appendChild(el('h3', null, '📥 ランキングExcel ダウンロード'));
  out.appendChild(el('button', {
    class: 'btn primary',
    onclick: () => {
      downloadXLSX(`ランキング_${td.test_id}.xlsx`, {
        'TOP20': {
          headers: ['順位', '生徒管理コード', '氏名', 'クラス', '合計点'],
          rows: totals.slice(0, 20).map((x, i) => [
            i + 1, x.r['生徒管理コード'] || '', x.name,
            x.r['クラス'] ?? '', x.score,
          ]),
        },
        'WORST20': {
          headers: ['順位（下から）', '生徒管理コード', '氏名', 'クラス', '合計点'],
          rows: worst.map((x, i) => [
            i + 1, x.r['生徒管理コード'] || '', x.name,
            x.r['クラス'] ?? '', x.score,
          ]),
        },
        '全員ランキング': {
          headers: ['順位', '生徒管理コード', '氏名', 'クラス', '合計点'],
          rows: totals.map((x, i) => [
            i + 1, x.r['生徒管理コード'] || '', x.name,
            x.r['クラス'] ?? '', x.score,
          ]),
        },
      });
    },
  }, el('i', { class: 'fas fa-file-excel' }), ' ランキングExcelをダウンロード'));

  out.appendChild(helpBox('ランキングの活用', [
    '【TOP20】 表彰・モデル生徒の選定。学習コミットメントの参考に。',
    '【WORST20】 個別声かけ・面談の優先度判断。早期介入の対象。',
    '【中間20】 「もう少しで上位に届きそう」な層。引き上げ可能性が高い。',
    '【クラス対抗】 学年集会や教科会での共有資料に。',
    '⚠️ 公開する場合は『匿名化ON』（右上）で生徒A〜Z表示にしてください。',
  ]));

  return out;
}

function makeRankTable(arr, cls, totalCount) {
  return renderTable(
    ['順位', '生徒管理コード', '氏名', 'クラス', '番号', '合計点'],
    arr.map((x, i) => [
      totalCount ? `下から${i + 1}位 (全${totalCount}中 ${totalCount - i}位)` : `${i + 1}位`,
      x.r['生徒管理コード'] || '—',
      x.name,
      x.r['クラス'] ?? '—',
      x.r['番号'] ?? '—',
      { v: x.score, cls },
    ])
  );
}

function makeDomainTable(arr, col, cls, totalCount) {
  return renderTable(
    ['順位', '生徒管理コード', '氏名', 'クラス', col, '得点率'],
    arr.map((x, i) => [
      totalCount ? `下から${i + 1}位` : `${i + 1}位`,
      x.r['生徒管理コード'] || '—',
      x.name,
      x.r['クラス'] ?? '—',
      x.score,
      { v: fmtPct(x.rate), cls },
    ])
  );
}

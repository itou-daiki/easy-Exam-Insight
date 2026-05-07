// Data Quality — sanity-check the loaded Excel before analyzing
// =========================================================================
import { el, kpi, renderTable, mean, stdev, fmtPct, fmtNum, downloadCSV } from '../utils.js?v=4';
import { singlePicker } from '../picker.js?v=4';
import { helpBox } from '../help.js?v=4';

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

  out.appendChild(el('div', { class: 'callout info' },
    el('strong', null, '🔍 データ品質チェック'),
    ' — 分析を始める前に、入力ミス・無回答・異常値などを検出します。',
    '実運用では「テスト結果が正しく入力されているか」を最初に確認することが重要です。'
  ));

  const itemNames = td.items.map(i => i.name);

  let totalCells = 0, missingCells = 0;
  for (const r of td.rows) {
    for (const c of itemNames) {
      totalCells++;
      if (!Number.isFinite(r[c])) missingCells++;
    }
  }
  const completeness = (totalCells - missingCells) / Math.max(1, totalCells);

  const missingStudents = td.rows.filter(r =>
    itemNames.some(c => !Number.isFinite(r[c]))
  );

  const allZeroStudents = td.rows.filter(r =>
    itemNames.every(c => r[c] === 0 || !Number.isFinite(r[c])) &&
    r['合計点'] === 0
  );

  const mismatches = [];
  for (const r of td.rows) {
    if (!Number.isFinite(r['合計点'])) continue;
    const sum = itemNames.reduce((s, c) => s + (Number.isFinite(r[c]) ? r[c] : 0), 0);
    if (Math.abs(sum - r['合計点']) > 0.5) {
      mismatches.push({
        name: r['氏名'], code: r['生徒管理コード'],
        reported: r['合計点'], sum, diff: r['合計点'] - sum,
      });
    }
  }

  const outOfRange = [];
  for (const r of td.rows) {
    for (const it of td.items) {
      const v = r[it.name];
      if (!Number.isFinite(v)) continue;
      if (v < 0 || (it.max_score && v > it.max_score)) {
        outOfRange.push({
          name: r['氏名'], code: r['生徒管理コード'],
          item: it.name, value: v, max: it.max_score,
        });
      }
    }
  }

  const outlierRows = [];
  for (const it of td.items) {
    const vals = td.rows.map(r => r[it.name]).filter(Number.isFinite);
    const mu = mean(vals), sd = stdev(vals) || 1;
    for (const r of td.rows) {
      const v = r[it.name];
      if (!Number.isFinite(v)) continue;
      const z = (v - mu) / sd;
      if (Math.abs(z) > 3) {
        outlierRows.push({
          name: r['氏名'], code: r['生徒管理コード'],
          item: it.name, value: v, z,
        });
      }
    }
  }

  const codes = td.rows.map(r => r['生徒管理コード']).filter(Boolean);
  const codeCounts = new Map();
  for (const c of codes) codeCounts.set(c, (codeCounts.get(c) || 0) + 1);
  const duplicates = [...codeCounts].filter(([, n]) => n > 1);

  out.appendChild(el('div', { class: 'kpi-row' },
    kpi('完全性', fmtPct(completeness),
      `${totalCells - missingCells} / ${totalCells} セル`),
    kpi('欠損のある生徒', missingStudents.length, '何らかの未回答'),
    kpi('合計点不一致', mismatches.length, '小計合計と合計点が違う'),
    kpi('範囲外得点', outOfRange.length, '配点超過 or 負の値'),
    kpi('外れ値 (|Z|>3)', outlierRows.length, '極端な得点'),
  ));

  const issues = missingStudents.length + mismatches.length + outOfRange.length + duplicates.length;
  out.appendChild(el('div', {
    class: 'callout ' + (issues === 0 ? 'success' : (issues < 5 ? 'warn' : 'danger'))
  },
    el('strong', null,
      issues === 0 ? '✅ データ品質OK' :
      issues < 5 ? '⚠️ 軽微な問題が検出されました' :
      '🚨 複数の問題が検出されました — 入力データを確認してください'
    ),
    el('br'),
    `合計 ${issues} 件の要確認項目があります。`
  ));

  if (missingStudents.length) {
    out.appendChild(el('h3', null, `📭 欠損のある生徒（${missingStudents.length}名）`));
    out.appendChild(renderTable(
      ['生徒管理コード', '氏名', 'クラス', '番号', '欠損項目'],
      missingStudents.slice(0, 50).map(r => [
        r['生徒管理コード'] || '—',
        r['氏名'] || '—',
        r['クラス'] ?? '—',
        r['番号'] ?? '—',
        itemNames.filter(c => !Number.isFinite(r[c])).join(', '),
      ])
    ));
    if (missingStudents.length > 50) {
      out.appendChild(el('p', { class: 'muted' }, `... 他 ${missingStudents.length - 50}名`));
    }
  }

  if (mismatches.length) {
    out.appendChild(el('h3', null, `⚠️ 合計点不一致（${mismatches.length}件）`));
    out.appendChild(el('p', { class: 'muted' },
      '小計の合計と入力された合計点が一致しない生徒。集計ミス・入力ミスの可能性があります。'));
    out.appendChild(renderTable(
      ['生徒管理コード', '氏名', '入力された合計点', '小計の合計', '差'],
      mismatches.slice(0, 50).map(m => [
        m.code || '—', m.name || '—',
        fmtNum(m.reported, 1),
        fmtNum(m.sum, 1),
        { v: fmtNum(m.diff, 1), cls: 'bad' },
      ])
    ));
  }

  if (outOfRange.length) {
    out.appendChild(el('h3', null, `🚨 範囲外得点（${outOfRange.length}件）`));
    out.appendChild(el('p', { class: 'muted' },
      '配点を超えた値、または負の値が入力されています。明らかな入力ミス。'));
    out.appendChild(renderTable(
      ['生徒管理コード', '氏名', '項目', '入力値', '配点'],
      outOfRange.slice(0, 50).map(o => [
        o.code || '—', o.name || '—', o.item,
        { v: fmtNum(o.value, 1), cls: 'bad' },
        o.max || '—',
      ])
    ));
  }

  if (outlierRows.length) {
    out.appendChild(el('h3', null, `📊 外れ値（${outlierRows.length}件）|Z|>3`));
    out.appendChild(el('p', { class: 'muted' },
      '同項目内で得点分布から極端に離れている値。入力ミスの可能性もあるので確認推奨。'));
    out.appendChild(renderTable(
      ['生徒管理コード', '氏名', '項目', '得点', 'Z'],
      outlierRows.slice(0, 50).map(o => [
        o.code || '—', o.name || '—', o.item,
        fmtNum(o.value, 1),
        { v: fmtNum(o.z, 2), cls: Math.abs(o.z) > 4 ? 'bad' : 'warn' },
      ])
    ));
  }

  if (duplicates.length) {
    out.appendChild(el('h3', null, `🔁 生徒管理コード重複（${duplicates.length}件）`));
    out.appendChild(renderTable(
      ['生徒管理コード', '出現回数'],
      duplicates.map(([c, n]) => [c, n])
    ));
  }

  if (allZeroStudents.length) {
    out.appendChild(el('h3', null, `🔇 全項目0点の生徒（${allZeroStudents.length}名）`));
    out.appendChild(el('p', { class: 'muted' },
      '欠席・受験未了・データ入力漏れの可能性があります。分析対象から除外するか確認してください。'));
    out.appendChild(renderTable(
      ['生徒管理コード', '氏名', 'クラス'],
      allZeroStudents.slice(0, 30).map(r => [
        r['生徒管理コード'] || '—', r['氏名'] || '—', r['クラス'] ?? '—'
      ])
    ));
  }

  out.appendChild(el('h3', null, '📋 項目別 完全性'));
  out.appendChild(renderTable(
    ['項目', '回答者数', '欠損', '完全性', 'Min', 'Max', '平均', 'SD'],
    td.items.map(it => {
      const vals = td.rows.map(r => r[it.name]).filter(Number.isFinite);
      const missing = td.rows.length - vals.length;
      const compl = vals.length / td.rows.length;
      return [
        it.name,
        vals.length,
        missing,
        { v: fmtPct(compl), cls: compl < 0.95 ? 'warn' : '' },
        vals.length ? fmtNum(Math.min(...vals), 1) : '—',
        vals.length ? fmtNum(Math.max(...vals), 1) : '—',
        fmtNum(mean(vals), 2),
        fmtNum(stdev(vals), 2),
      ];
    })
  ));

  if (issues > 0) {
    out.appendChild(el('h3', null, '📥 問題リストをCSVでダウンロード'));
    out.appendChild(el('button', {
      class: 'btn primary',
      onclick: () => {
        const allIssues = [
          ...missingStudents.map(r => [r['生徒管理コード'], r['氏名'], '欠損項目あり', '', '']),
          ...mismatches.map(m => [m.code, m.name, '合計点不一致', `入力=${m.reported}, 小計=${m.sum}`, '']),
          ...outOfRange.map(o => [o.code, o.name, '範囲外得点', o.item, `${o.value} (max=${o.max})`]),
          ...outlierRows.map(o => [o.code, o.name, '外れ値', o.item, `${o.value} (Z=${o.z.toFixed(2)})`]),
        ];
        downloadCSV(`data_quality_${td.test_id}.csv`,
          ['生徒管理コード', '氏名', '問題種別', '項目', '値'],
          allIssues
        );
      },
    }, el('i', { class: 'fas fa-download' }), ' 問題リストCSVをダウンロード'));
  }

  out.appendChild(helpBox('データ品質チェックの活用', [
    '【最初に確認】 分析の前にこのページを開いて、入力データに問題がないか確認しましょう。',
    '【欠損のある生徒】 欠席者・受験未了者の可能性。分析から除外するか教科で判断を。',
    '【合計点不一致】 集計時の入力ミス。元の答案を再確認してください。',
    '【外れ値】 統計上珍しい値ですが「異常」とは限らない。「特別に良くできた」可能性も。',
  ]));

  return out;
}

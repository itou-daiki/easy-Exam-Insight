// Summary — one-page executive overview across all loaded tests
// =========================================================================
import { el, kpi, plotEl, renderTable, mean, stdev, corr, fmtPct, fmtNum, downloadXLSX } from '../utils.js?v=5';
import { ratioMatrix } from '../loader.js?v=5';
import { helpBox } from '../help.js?v=5';

export function render(container, state) {
  const out = el('div');

  if (!state.tests.length) {
    out.appendChild(el('div', { class: 'callout warn' }, 'データを読み込んでください'));
    container.appendChild(out);
    return;
  }

  out.appendChild(el('div', { class: 'callout info' },
    el('strong', null, '📋 サマリー'),
    ' — 読み込んだ全ての考査の要点を1ページにまとめて表示します。',
    'まずここを見れば、何が起こっているか / 次にやるべきことが分かります。'
  ));

  const tests = state.tests.slice().sort((a, b) => {
    const da = a.test_date ? a.test_date.getTime() : Infinity;
    const db = b.test_date ? b.test_date.getTime() : Infinity;
    return da - db;
  });

  out.appendChild(el('h3', null, '🌐 全体KPI'));
  let totalStudents = 0, totalItems = 0;
  for (const t of tests) {
    totalStudents += t.rows.length;
    totalItems += t.items.length;
  }
  const grades = new Set(tests.map(t => t.grade).filter(g => g != null));
  const subjects = new Set(tests.map(t => t.subject));

  out.appendChild(el('div', { class: 'kpi-row' },
    kpi('読み込み考査数', tests.length),
    kpi('対象学年', [...grades].sort().join('・') || '—'),
    kpi('対象科目', [...subjects].join('・') || '—'),
    kpi('延べ受験者数', totalStudents),
    kpi('延べ小問数', totalItems),
  ));

  out.appendChild(el('h3', null, '📚 考査別サマリー'));
  const summaryRows = tests.map(t => {
    const totals = t.rows.map(r => r['合計点']).filter(Number.isFinite);
    const itemNames = t.items.map(i => i.name);
    const matrix = t.rows.map(r => itemNames.map(c => r[c]));
    const completeMatrix = matrix.filter(r => r.every(Number.isFinite));
    const alpha = cronbachAlphaLocal(completeMatrix);
    return [
      t.test_id,
      t.test_date ? t.test_date.toISOString().slice(0, 10) : '—',
      t.subject,
      t.grade ?? '—',
      t.rows.length,
      t.items.length,
      fmtNum(mean(totals), 1),
      fmtNum(stdev(totals), 1),
      Number.isFinite(alpha) ? alpha.toFixed(3) : '—',
    ];
  });
  out.appendChild(renderTable(
    ['考査', '実施日', '科目', '学年', '受験者数', '小問数', '平均合計点', 'SD', 'α'],
    summaryRows,
  ));

  const latest = tests[tests.length - 1];
  out.appendChild(el('h3', null, `🚨 直近考査「${latest.test_id}」の再指導推奨 TOP 5`));
  const priorityList = computePriority(latest);
  out.appendChild(renderTable(
    ['順位', '項目', '単元', '全体得点率', '識別力', '再指導優先度'],
    priorityList.slice(0, 5).map((p, i) => [
      `${i + 1}位`,
      p.item.name,
      p.item.unit_name || '—',
      fmtPct(p.rate),
      fmtNum(p.r, 3),
      { v: fmtNum(p.score, 3), cls: p.score >= 0.3 ? 'bad' : (p.score >= 0.15 ? 'warn' : '') },
    ])
  ));
  if (priorityList[0]) {
    const top = priorityList[0];
    out.appendChild(el('div', { class: 'callout warn' },
      el('strong', null, '🎯 次に取り組むべきテーマ: '),
      top.item.unit_name ? `${top.item.unit_name}（${top.item.name}）` : top.item.name,
      el('br'),
      `現在の全体得点率は ${fmtPct(top.rate)}、識別力 ${fmtNum(top.r, 2)}。`,
      '教えれば伸びる可能性が最も高い項目です。'
    ));
  }

  if (latest.rows[0] && 'クラス' in latest.rows[0]) {
    out.appendChild(el('h3', null, '🏫 クラス別 直近平均'));
    const classes = [...new Set(latest.rows.map(r => r['クラス']).filter(v => v != null))].sort();
    out.appendChild(renderTable(
      ['クラス', '人数', '平均', 'SD', '最低', '最高'],
      classes.map(c => {
        const subset = latest.rows.filter(r => r['クラス'] === c);
        const totals = subset.map(r => r['合計点']).filter(Number.isFinite);
        return [
          `クラス${c}`,
          subset.length,
          fmtNum(mean(totals), 1),
          fmtNum(stdev(totals), 1),
          totals.length ? fmtNum(Math.min(...totals), 1) : '—',
          totals.length ? fmtNum(Math.max(...totals), 1) : '—',
        ];
      })
    ));
  }

  if (tests.length >= 2) {
    out.appendChild(el('h3', null, '📈 学年全体の推移'));
    const xs = tests.map(t => t.test_id);
    const ys = tests.map(t => mean(t.rows.map(r => r['合計点']).filter(Number.isFinite)));
    out.appendChild(plotEl(
      [{
        x: xs, y: ys, mode: 'lines+markers+text', type: 'scatter',
        line: { color: '#1e90ff', width: 3 },
        marker: { size: 12 },
        text: ys.map(v => fmtNum(v, 1)),
        textposition: 'top center',
      }],
      { yaxis: { title: '平均合計点' }, xaxis: { title: '考査' }, height: 320, margin: { t: 20 } }
    ));

    const codeMap = new Map();
    for (const t of tests) {
      const totals = t.rows.map(r => r['合計点']).filter(Number.isFinite);
      const mu = mean(totals), sd = stdev(totals) || 1;
      for (const r of t.rows) {
        const code = r['生徒管理コード'];
        if (!code || !Number.isFinite(r['合計点'])) continue;
        if (!codeMap.has(code)) codeMap.set(code, { name: r['氏名'], byTest: {} });
        const e = codeMap.get(code);
        if (!e.name) e.name = r['氏名'];
        e.byTest[t.test_id] = (r['合計点'] - mu) / sd;
      }
    }
    const tracked = [...codeMap.values()].filter(e =>
      tests.every(t => e.byTest[t.test_id] != null)
    );
    const dz = tracked.map(e => ({
      ...e,
      delta: e.byTest[tests[tests.length - 1].test_id] - e.byTest[tests[0].test_id],
    })).sort((a, b) => b.delta - a.delta);

    out.appendChild(el('h3', null, '🚀 大きく伸びた / 落ちた生徒（直近 vs 初回）'));
    out.appendChild(el('div', { class: 'plot-grid' },
      (() => {
        const d = el('div');
        d.appendChild(el('h4', null, '🚀 伸び TOP 5'));
        d.appendChild(renderTable(
          ['氏名', '初回Z', '直近Z', 'ΔZ'],
          dz.slice(0, 5).map(e => [
            e.name || '—',
            fmtNum(e.byTest[tests[0].test_id], 2),
            fmtNum(e.byTest[tests[tests.length - 1].test_id], 2),
            { v: `+${e.delta.toFixed(2)}`, cls: 'good' },
          ])
        ));
        return d;
      })(),
      (() => {
        const d = el('div');
        d.appendChild(el('h4', null, '🚨 低下 TOP 5（要面談）'));
        d.appendChild(renderTable(
          ['氏名', '初回Z', '直近Z', 'ΔZ'],
          dz.slice(-5).reverse().map(e => [
            e.name || '—',
            fmtNum(e.byTest[tests[0].test_id], 2),
            fmtNum(e.byTest[tests[tests.length - 1].test_id], 2),
            { v: e.delta.toFixed(2), cls: 'bad' },
          ])
        ));
        return d;
      })(),
    ));
  }

  out.appendChild(el('h3', null, '✅ 次のアクション（自動生成）'));
  const actions = [];
  if (priorityList[0]) {
    actions.push(`次の授業で「${priorityList[0].item.unit_name || priorityList[0].item.name}」の基礎を10〜15分復習する`);
  }
  if (tests.length >= 2) {
    const codeMap = new Map();
    for (const t of tests) {
      const totals = t.rows.map(r => r['合計点']).filter(Number.isFinite);
      const mu = mean(totals), sd = stdev(totals) || 1;
      for (const r of t.rows) {
        const code = r['生徒管理コード'];
        if (!code || !Number.isFinite(r['合計点'])) continue;
        if (!codeMap.has(code)) codeMap.set(code, { name: r['氏名'], byTest: {} });
        codeMap.get(code).byTest[t.test_id] = (r['合計点'] - mu) / sd;
      }
    }
    const chronic = [...codeMap.values()].filter(e =>
      tests.every(t => e.byTest[t.test_id] != null && e.byTest[t.test_id] < -1)
    );
    if (chronic.length) {
      actions.push(`持続的に下位の生徒 ${chronic.length}名（${chronic.slice(0, 3).map(e => e.name).join('・')} 等）に個別の声かけ・面談を実施`);
    }
  }
  const veryHard = priorityList.filter(p => p.rate < 0.3);
  if (veryHard.length) {
    actions.push(`極端に難易度が高すぎる項目 ${veryHard.length}個（${veryHard.slice(0, 2).map(p => p.item.name).join('・')}）の出題を見直し`);
  }
  if (latest.items.length >= 3) {
    actions.push('「クラスタ分析」で生徒タイプを把握し、タイプ別の学習グループを編成');
  }
  actions.push('「生徒別フィードバック」で個人カルテを印刷し、面談で活用');

  const actionList = el('ol', { style: { paddingLeft: '1.5rem', lineHeight: '1.9' } });
  for (const a of actions) actionList.appendChild(el('li', null, a));
  out.appendChild(actionList);

  out.appendChild(el('h3', null, '📥 サマリーExcel ダウンロード'));
  out.appendChild(el('button', {
    class: 'btn primary',
    onclick: () => {
      downloadXLSX(`summary_${new Date().toISOString().slice(0, 10)}.xlsx`, {
        '考査別サマリー': {
          headers: ['考査', '実施日', '科目', '学年', '受験者数', '小問数', '平均', 'SD', 'α'],
          rows: summaryRows,
        },
        '再指導優先度': {
          headers: ['順位', '項目', '単元', '全体得点率', '識別力', '優先度'],
          rows: priorityList.map((p, i) => [
            i + 1, p.item.name, p.item.unit_name || '', p.rate, p.r, p.score,
          ]),
        },
        'アクション': {
          headers: ['No', '推奨アクション'],
          rows: actions.map((a, i) => [i + 1, a]),
        },
      });
    },
  }, el('i', { class: 'fas fa-file-excel' }), ' サマリーをExcelで保存'));

  out.appendChild(helpBox('サマリーで何ができる？', [
    '【1ページで見渡す】 読み込んだ全考査の主要指標が一覧できます。',
    '【次の行動が明確】 「アクション」欄に、データから自動的に導かれる次の手を提示。',
    '【共有しやすい】 Excelに書き出して、教科会や学年会の資料にそのまま使えます。',
  ]));

  container.appendChild(out);
}

function computePriority(td) {
  const itemNames = td.items.map(i => i.name);
  const totals = td.rows.map(r => itemNames.reduce((s, c) => s + (Number.isFinite(r[c]) ? r[c] : 0), 0));
  const ratios = ratioMatrix(td);
  return td.items.map((it, j) => {
    const rate = mean(ratios.map(r => r[j]).filter(Number.isFinite));
    const x = td.rows.map(r => r[it.name]);
    const rest = td.rows.map((_, i) => totals[i] - (Number.isFinite(x[i]) ? x[i] : 0));
    const r = corr(x, rest);
    return { item: it, rate, r, score: (1 - rate) * (Number.isFinite(r) ? r : 0) };
  }).sort((a, b) => b.score - a.score);
}

function cronbachAlphaLocal(matrix) {
  if (!matrix.length || matrix[0].length < 2) return NaN;
  const k = matrix[0].length;
  let varSum = 0;
  for (let j = 0; j < k; j++) varSum += variance(matrix.map(r => r[j]));
  const totalVar = variance(matrix.map(r => r.reduce((s, x) => s + x, 0)));
  if (totalVar === 0) return NaN;
  return (k / (k - 1)) * (1 - varSum / totalVar);
}
function variance(arr) {
  const v = arr.filter(Number.isFinite);
  if (v.length < 2) return 0;
  const m = mean(v);
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
}

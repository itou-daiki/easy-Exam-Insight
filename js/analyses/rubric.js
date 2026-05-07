// Rubric — 観点別評定マトリックス（通知表用）
// =========================================================================
import { el, kpi, plotEl, renderTable, fmtPct, downloadXLSX } from '../utils.js?v=5';
import { singlePicker } from '../picker.js?v=5';
import { helpBox } from '../help.js?v=5';

export function render(container, state) {
  const wrap = el('div');
  let tdCurrent = null, mount;
  const refresh = () => {
    if (!tdCurrent) return;
    if (mount) mount.remove();
    mount = build(tdCurrent, +scaleSel.value, +pAB.value, +pBC.value, +pCD.value, +pDE.value);
    wrap.appendChild(mount);
  };
  wrap.appendChild(singlePicker(state, td => { tdCurrent = td; refresh(); }));

  const ctrl = el('div', { class: 'form-row' });
  const scaleSel = el('select');
  scaleSel.appendChild(el('option', { value: 5 }, '5段階評定 (5/4/3/2/1)'));
  scaleSel.appendChild(el('option', { value: 3 }, '3段階評定 (A/B/C)'));
  const pAB = el('input', { type: 'number', step: 0.05, min: 0.5, max: 1.0, value: 0.85, style: { width: '70px' } });
  const pBC = el('input', { type: 'number', step: 0.05, min: 0.4, max: 0.9, value: 0.65, style: { width: '70px' } });
  const pCD = el('input', { type: 'number', step: 0.05, min: 0.2, max: 0.7, value: 0.45, style: { width: '70px' } });
  const pDE = el('input', { type: 'number', step: 0.05, min: 0.1, max: 0.5, value: 0.30, style: { width: '70px' } });

  ctrl.appendChild(el('label', null, 'スケール', scaleSel));
  ctrl.appendChild(el('label', null, '5/A 境界 (得点率≥)', pAB));
  ctrl.appendChild(el('label', null, '4/B 境界', pBC));
  ctrl.appendChild(el('label', null, '3 境界', pCD));
  ctrl.appendChild(el('label', null, '2 境界', pDE));
  ctrl.appendChild(el('button', { class: 'btn primary', onclick: refresh },
    el('i', { class: 'fas fa-sync' }), ' 再計算'));

  scaleSel.addEventListener('change', refresh);
  for (const inp of [pAB, pBC, pCD, pDE]) inp.addEventListener('change', refresh);

  wrap.appendChild(ctrl);
  container.appendChild(wrap);
}

function gradeOf5(rate, t1, t2, t3, t4) {
  if (!Number.isFinite(rate)) return '—';
  if (rate >= t1) return 5;
  if (rate >= t2) return 4;
  if (rate >= t3) return 3;
  if (rate >= t4) return 2;
  return 1;
}
function gradeOf3(rate, t1, t2) {
  if (!Number.isFinite(rate)) return '—';
  if (rate >= t1) return 'A';
  if (rate >= t2) return 'B';
  return 'C';
}

function build(td, scale, t1, t2, t3, t4) {
  const out = el('div');

  out.appendChild(el('div', { class: 'callout info' },
    el('strong', null, '📊 観点別評定マトリックス'),
    el('br'),
    'テスト結果から「知識・技能」「思考・判断・表現」などの観点別の評定を自動計算します。',
    '通知表や学期成績にそのまま転記できます。',
    el('br'),
    '※ 境界は教科会で決めた基準に合わせて変更できます（既定: 85% / 65% / 45% / 30%）。'
  ));

  const knowCol = td.domain_cols.includes('知') ? '知' : null;
  const thinkCol = td.domain_cols.includes('思') ? '思' : null;
  const totalCol = '合計点';
  const knowMax = (td.domain_max_scores && td.domain_max_scores['知']) || maxObserved(td, '知');
  const thinkMax = (td.domain_max_scores && td.domain_max_scores['思']) || maxObserved(td, '思');
  const totalMax = (td.domain_max_scores && td.domain_max_scores['合計点']) || maxObserved(td, '合計点');

  const useThree = scale === 3;
  const grade = (rate) => useThree ? gradeOf3(rate, t1, t2) : gradeOf5(rate, t1, t2, t3, t4);

  const rows = td.rows.map(r => {
    const t = Number.isFinite(r[totalCol]) ? r[totalCol] / totalMax : NaN;
    const k = knowCol && Number.isFinite(r[knowCol]) ? r[knowCol] / knowMax : NaN;
    const th = thinkCol && Number.isFinite(r[thinkCol]) ? r[thinkCol] / thinkMax : NaN;
    return {
      r, totalRate: t, knowRate: k, thinkRate: th,
      totalGrade: grade(t),
      knowGrade: knowCol ? grade(k) : null,
      thinkGrade: thinkCol ? grade(th) : null,
    };
  });

  out.appendChild(el('div', { class: 'kpi-row' },
    kpi('対象生徒数', td.rows.length),
    kpi('観点数', [knowCol, thinkCol, totalCol].filter(Boolean).length),
    kpi('スケール', useThree ? '3段階(A/B/C)' : '5段階(5〜1)'),
  ));

  out.appendChild(el('h3', null, '📊 評定分布'));
  const labels = useThree ? ['A', 'B', 'C'] : [5, 4, 3, 2, 1];
  const colors = useThree ? ['#10b981', '#1e90ff', '#ef4444'] : ['#065f46', '#10b981', '#1e90ff', '#f59e0b', '#ef4444'];
  const traces = [];
  for (let i = 0; i < labels.length; i++) {
    const lbl = labels[i];
    const series = [];
    if (knowCol) series.push({ axis: '知識・技能', count: rows.filter(x => x.knowGrade === lbl).length });
    if (thinkCol) series.push({ axis: '思考・判断・表現', count: rows.filter(x => x.thinkGrade === lbl).length });
    series.push({ axis: '総合', count: rows.filter(x => x.totalGrade === lbl).length });
    traces.push({
      type: 'bar',
      x: series.map(s => s.axis),
      y: series.map(s => s.count),
      name: String(lbl),
      marker: { color: colors[i] },
    });
  }
  out.appendChild(plotEl(traces, {
    barmode: 'stack',
    yaxis: { title: '人数' },
    height: 360, margin: { t: 20 },
  }));

  const distRows = labels.map(lbl => {
    const k = rows.filter(x => x.knowGrade === lbl).length;
    const t = rows.filter(x => x.thinkGrade === lbl).length;
    const tot = rows.filter(x => x.totalGrade === lbl).length;
    return [
      String(lbl),
      knowCol ? `${k}名 (${fmtPct(k / td.rows.length)})` : '—',
      thinkCol ? `${t}名 (${fmtPct(t / td.rows.length)})` : '—',
      `${tot}名 (${fmtPct(tot / td.rows.length)})`,
    ];
  });
  out.appendChild(renderTable(['評定', '知識・技能', '思考・判断・表現', '総合'], distRows));

  out.appendChild(el('h3', null, '🧑‍🎓 生徒別 観点別評定'));
  const anonymize = !!window._appState?.anonymize;
  const studentRows = rows.map((x, i) => {
    const r = x.r;
    const name = anonymize
      ? `生徒${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`
      : (r['氏名'] || '—');
    return [
      r['生徒管理コード'] || '—',
      name,
      r['クラス'] ?? '—',
      r['番号'] ?? '—',
      knowCol ? r[knowCol] : '—',
      knowCol ? fmtPct(x.knowRate) : '—',
      knowCol ? { v: String(x.knowGrade), cls: gradeClass(x.knowGrade, useThree) } : '—',
      thinkCol ? r[thinkCol] : '—',
      thinkCol ? fmtPct(x.thinkRate) : '—',
      thinkCol ? { v: String(x.thinkGrade), cls: gradeClass(x.thinkGrade, useThree) } : '—',
      r[totalCol] ?? '—',
      fmtPct(x.totalRate),
      { v: String(x.totalGrade), cls: gradeClass(x.totalGrade, useThree) },
    ];
  });
  out.appendChild(renderTable(
    ['生徒管理コード', '氏名', 'クラス', '番号',
     '知識 得点', '知識 得点率', '知識 評定',
     '思考 得点', '思考 得点率', '思考 評定',
     '総合 得点', '総合 得点率', '総合 評定'],
    studentRows,
  ));

  out.appendChild(el('h3', null, '📥 評定簿 Excel ダウンロード'));
  out.appendChild(el('button', {
    class: 'btn primary',
    onclick: () => {
      downloadXLSX(`評定簿_${td.test_id}.xlsx`, {
        '評定分布': {
          headers: ['評定', '知識・技能', '思考・判断・表現', '総合'],
          rows: distRows,
        },
        '生徒別評定': {
          headers: ['生徒管理コード', '氏名', 'クラス', '番号',
            '知識得点', '知識得点率', '知識評定',
            '思考得点', '思考得点率', '思考評定',
            '総合得点', '総合得点率', '総合評定'],
          rows: studentRows.map(r => r.map(c => c && typeof c === 'object' ? c.v : c)),
        },
        '評定基準': {
          headers: ['評定', '得点率の境界'],
          rows: useThree
            ? [['A', `≥ ${fmtPct(t1)}`], ['B', `≥ ${fmtPct(t2)}`], ['C', `< ${fmtPct(t2)}`]]
            : [
                ['5', `≥ ${fmtPct(t1)}`],
                ['4', `≥ ${fmtPct(t2)}`],
                ['3', `≥ ${fmtPct(t3)}`],
                ['2', `≥ ${fmtPct(t4)}`],
                ['1', `< ${fmtPct(t4)}`],
              ],
        },
      });
    },
  }, el('i', { class: 'fas fa-file-excel' }), ' 評定簿Excelをダウンロード'));

  out.appendChild(helpBox('観点別評定の使い方', [
    '【1】 教科会で評定境界（85%/65%/45%/30%など）を合意',
    '【2】 上のフォームで境界を設定し「再計算」ボタン',
    '【3】 評定分布をチェックして偏りすぎていないか確認',
    '【4】 「評定簿Excel」をダウンロードして通知表入力に使用',
    '注意: 評定は最終判断ではなく目安です。学期評価と合わせて総合的に判断してください。',
  ]));

  return out;
}

function gradeClass(g, useThree) {
  if (g === '—') return '';
  if (useThree) return g === 'A' ? 'good' : (g === 'C' ? 'bad' : '');
  if (g === 5) return 'good';
  if (g === 1 || g === 2) return 'bad';
  return '';
}

function maxObserved(td, col) {
  return Math.max(...td.rows.map(r => r[col]).filter(Number.isFinite), 1);
}

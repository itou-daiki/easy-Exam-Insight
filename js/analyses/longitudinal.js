// Longitudinal — compare across multiple tests
// =========================================================================
import { el, plotEl, renderTable, mean, stdev, fmtNum } from '../utils.js';

export function render(container, state) {
  const wrap = el('div');
  if (state.tests.length < 2) {
    wrap.appendChild(el('div', { class: 'callout warn' }, '縦断比較には2つ以上の考査が必要です'));
    container.appendChild(wrap);
    return;
  }

  const sel = el('select', { multiple: true, size: Math.min(6, state.tests.length), style: { minWidth: '320px' } });
  state.tests.forEach((t, i) => {
    sel.appendChild(el('option', { value: i, selected: 'selected' }, t.test_id));
  });
  const studentSelect = el('select', { multiple: true, size: 6, style: { minWidth: '320px' } });

  let mount = null;
  function refresh() {
    if (mount) mount.remove();
    const idxs = Array.from(sel.selectedOptions).map(o => parseInt(o.value, 10));
    const sids = Array.from(studentSelect.selectedOptions).map(o => o.value);
    const tests = idxs.map(i => state.tests[i]);
    if (tests.length < 2) {
      mount = el('div', { class: 'callout info' }, '考査を2つ以上選択してください');
    } else {
      mount = build(tests, sids, students => populateStudentList(students));
    }
    wrap.appendChild(mount);
  }
  function populateStudentList(students) {
    const previouslySelected = new Set(Array.from(studentSelect.selectedOptions).map(o => o.value));
    studentSelect.innerHTML = '';
    students.forEach(({ code, name }) => {
      const opt = el('option', { value: code }, `${name} (${code})`);
      if (previouslySelected.has(code)) opt.selected = true;
      studentSelect.appendChild(opt);
    });
  }
  sel.addEventListener('change', refresh);
  studentSelect.addEventListener('change', refresh);

  wrap.appendChild(el('div', { class: 'form-row' },
    el('label', null, '比較する考査（複数選択）', sel),
    el('label', null, '個別軌跡を見る生徒（複数選択可）', studentSelect),
  ));
  container.appendChild(wrap);
  refresh();
}

function build(tests, selectedSids, onStudentsResolved) {
  const out = el('div');
  tests = tests.slice().sort((a, b) => {
    const da = a.test_date ? a.test_date.getTime() : Infinity;
    const db = b.test_date ? b.test_date.getTime() : Infinity;
    return da - db;
  });

  const codeToRows = new Map();
  for (const t of tests) {
    const totals = t.rows.map(r => r['合計点']).filter(Number.isFinite);
    const mu = mean(totals), sd = stdev(totals) || 1;
    for (const r of t.rows) {
      const code = r['生徒管理コード'];
      if (!code) continue;
      if (!codeToRows.has(code)) codeToRows.set(code, { name: r['氏名'], byTest: {} });
      const ent = codeToRows.get(code);
      if (!ent.name) ent.name = r['氏名'];
      ent.byTest[t.test_id] = {
        total: r['合計点'],
        z: Number.isFinite(r['合計点']) ? (r['合計点'] - mu) / sd : NaN,
        cls: r['クラス'],
      };
    }
  }
  const studentList = [];
  for (const [code, ent] of codeToRows) {
    const present = tests.every(t => ent.byTest[t.test_id] != null);
    if (present) studentList.push({ code, name: ent.name || '—', byTest: ent.byTest });
  }
  onStudentsResolved && onStudentsResolved(studentList);

  out.appendChild(el('h3', null, '📊 学年全体の合計点推移'));
  const stats = tests.map(t => {
    const v = t.rows.map(r => r['合計点']).filter(Number.isFinite);
    return { test: t.test_id, mean: mean(v), median: medianLocal(v), sd: stdev(v), n: v.length };
  });
  out.appendChild(renderTable(
    ['考査', '受験者数', '平均', '中央値', '標準偏差'],
    stats.map(s => [s.test, s.n, fmtNum(s.mean, 2), fmtNum(s.median, 2), fmtNum(s.sd, 2)])
  ));
  out.appendChild(plotEl(
    tests.map(t => ({
      type: 'box',
      y: t.rows.map(r => r['合計点']).filter(Number.isFinite),
      name: t.test_id, boxpoints: 'all', jitter: 0.3, pointpos: 0,
    })),
    { yaxis: { title: '合計点' }, height: 420, margin: { t: 20 } }
  ));

  if (tests.length >= 2 && studentList.length) {
    const first = tests[0].test_id;
    const last = tests[tests.length - 1].test_id;
    const ranked = studentList.map(s => ({
      ...s,
      dz: (s.byTest[last].z - s.byTest[first].z),
      firstZ: s.byTest[first].z,
      lastZ: s.byTest[last].z,
    })).filter(s => Number.isFinite(s.dz));

    const risers = ranked.slice().sort((a, b) => b.dz - a.dz).slice(0, 10);
    const fallers = ranked.slice().sort((a, b) => a.dz - b.dz).slice(0, 10);

    out.appendChild(el('div', { class: 'plot-grid' },
      (() => {
        const div = el('div');
        div.appendChild(el('h4', null, '🚀 大きく伸びた生徒 Top 10'));
        div.appendChild(renderTable(
          ['氏名', '生徒管理コード', `初期Z(${first})`, `末期Z(${last})`, 'ΔZ'],
          risers.map(r => [r.name, r.code, fmtNum(r.firstZ, 2), fmtNum(r.lastZ, 2),
            { v: `+${fmtNum(r.dz, 2)}`, cls: 'good' }])
        ));
        return div;
      })(),
      (() => {
        const div = el('div');
        div.appendChild(el('h4', null, '🚨 大きく落ちた生徒 Top 10（要面談）'));
        div.appendChild(renderTable(
          ['氏名', '生徒管理コード', `初期Z(${first})`, `末期Z(${last})`, 'ΔZ'],
          fallers.map(r => [r.name, r.code, fmtNum(r.firstZ, 2), fmtNum(r.lastZ, 2),
            { v: fmtNum(r.dz, 2), cls: 'bad' }])
        ));
        return div;
      })()
    ));

    const chronic = ranked.filter(s => tests.every(t => s.byTest[t.test_id].z < -1));
    out.appendChild(el('h3', null, '🎯 持続的に下位の生徒（全テストでZ < -1）'));
    if (chronic.length) {
      out.appendChild(renderTable(
        ['氏名', '生徒管理コード', ...tests.map(t => `Z(${t.test_id})`)],
        chronic.map(s => [s.name, s.code, ...tests.map(t => fmtNum(s.byTest[t.test_id].z, 2))])
      ));
      out.appendChild(el('div', { class: 'callout warn' },
        `${chronic.length}名が全テストで学年下位（Z<-1）に該当。早期介入を推奨。`));
    } else {
      out.appendChild(el('div', { class: 'callout success' },
        '全テストで持続的に下位の生徒は検出されませんでした。'));
    }

    out.appendChild(el('h3', null, '🔮 次回予測スコア（線形外挿）'));
    const allDates = tests.every(t => t.test_date);
    const predictions = ranked.map(s => {
      const xs = tests.map((t, i) => allDates ? t.test_date.getTime() : i);
      const ys = tests.map(t => s.byTest[t.test_id].total);
      if (ys.filter(Number.isFinite).length < 2) return null;
      const n = ys.length;
      const meanX = mean(xs), meanY = mean(ys);
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - meanX) * (ys[i] - meanY);
        den += (xs[i] - meanX) ** 2;
      }
      const slope = den > 0 ? num / den : 0;
      const intercept = meanY - slope * meanX;
      const nextX = allDates
        ? xs[n - 1] + (xs[n - 1] - xs[0]) / Math.max(1, n - 1)
        : n;
      const predicted = intercept + slope * nextX;
      return { ...s, lastTotal: ys[n - 1], predicted, slope };
    }).filter(Boolean);
    const top10 = predictions.slice().sort((a, b) => b.predicted - a.predicted).slice(0, 10);
    const bot10 = predictions.slice().sort((a, b) => a.predicted - b.predicted).slice(0, 10);
    out.appendChild(el('div', { class: 'plot-grid' },
      (() => {
        const d = el('div');
        d.appendChild(el('h4', null, '📈 予測上位 10名'));
        d.appendChild(renderTable(
          ['氏名', '直近合計点', '予測合計点', '傾向'],
          top10.map(s => [s.name, fmtNum(s.lastTotal, 1), fmtNum(s.predicted, 1),
            { v: s.slope > 0 ? '↑ 上昇' : (s.slope < 0 ? '↓ 下降' : '→ 横這い'),
              cls: s.slope > 0 ? 'good' : (s.slope < 0 ? 'bad' : '') }])
        ));
        return d;
      })(),
      (() => {
        const d = el('div');
        d.appendChild(el('h4', null, '📉 予測下位 10名（要支援）'));
        d.appendChild(renderTable(
          ['氏名', '直近合計点', '予測合計点', '傾向'],
          bot10.map(s => [s.name, fmtNum(s.lastTotal, 1), fmtNum(s.predicted, 1),
            { v: s.slope > 0 ? '↑ 上昇' : (s.slope < 0 ? '↓ 下降' : '→ 横這い'),
              cls: s.slope > 0 ? 'good' : (s.slope < 0 ? 'bad' : '') }])
        ));
        return d;
      })()
    ));
    out.appendChild(el('p', { class: 'muted' },
      '※ 線形外挿は参考値です。データ点が少ない、生徒個別の事情がある場合は精度が下がります。'));
  }

  if (selectedSids && selectedSids.length) {
    out.appendChild(el('h3', null, '🔍 個別軌跡（Zスコア）'));
    const traces = selectedSids.map(code => {
      const ent = codeToRows.get(code);
      if (!ent) return null;
      return {
        x: tests.map(t => t.test_id),
        y: tests.map(t => ent.byTest[t.test_id]?.z ?? null),
        name: ent.name,
        type: 'scatter',
        mode: 'lines+markers',
      };
    }).filter(Boolean);
    out.appendChild(plotEl(traces, {
      xaxis: { title: '考査' },
      yaxis: { title: 'Zスコア' },
      shapes: [
        { type: 'line', x0: -0.5, x1: tests.length - 0.5, y0: 0, y1: 0,
          line: { color: '#94a3b8', dash: 'dot' } },
      ],
      height: 420, margin: { t: 20 },
    }));
  }

  return out;
}

function medianLocal(a) {
  const v = a.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

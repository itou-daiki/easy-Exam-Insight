// Per-student feedback — personal report with auto-generated coaching
// =========================================================================
import { el, kpi, plotEl, renderTable, mean, stdev, fmtPct, fmtNum, displayName } from '../utils.js?v=5';
import { singlePicker } from '../picker.js?v=5';
import { ratioMatrix } from '../loader.js?v=5';
import { explain, helpBox, howToRead } from '../help.js?v=5';

export function render(container, state) {
  const wrap = el('div');
  let tdCurrent = null, mountStudent;
  const studentSelect = el('select', { style: { minWidth: '320px' } });
  const studentRow = el('div', { class: 'form-row' });
  studentRow.appendChild(el('label', null, '生徒を選択', studentSelect));

  // Class-batch print controls
  const classSelect = el('select', { style: { minWidth: '180px' } });
  const printClassBtn = el('button', {
    class: 'btn primary',
    onclick: () => {
      if (!tdCurrent) return;
      printClassReports(tdCurrent, classSelect.value);
    },
  }, el('i', { class: 'fas fa-print' }), ' 選択クラスの個票を一括印刷');
  const classPrintRow = el('div', { class: 'form-row class-print-row' });
  classPrintRow.appendChild(el('label', null, 'クラスを選択', classSelect));
  classPrintRow.appendChild(printClassBtn);
  classPrintRow.appendChild(el('span', { class: 'muted' }, '※ 1人あたりA4 2枚で出力されます'));

  function rebuildStudentList() {
    studentSelect.innerHTML = '';
    classSelect.innerHTML = '';
    if (!tdCurrent) return;
    tdCurrent.rows.forEach((r, i) => {
      const cls = r['クラス'] ?? '?';
      const no = r['番号'] ?? '?';
      const name = displayName(r['氏名'], i, r['生徒管理コード']);
      studentSelect.appendChild(el('option', { value: i },
        `${cls}-${String(no).padStart(2, ' ')} ${name}`));
    });

    const classes = [...new Set(tdCurrent.rows.map(r => r['クラス']).filter(v => v != null))]
      .sort((a, b) => (typeof a === 'number' && typeof b === 'number')
        ? (a - b)
        : String(a).localeCompare(String(b)));
    classSelect.appendChild(el('option', { value: '__all__' }, `全員（${tdCurrent.rows.length}名）`));
    for (const c of classes) {
      const n = tdCurrent.rows.filter(r => r['クラス'] === c).length;
      classSelect.appendChild(el('option', { value: String(c) }, `クラス ${c}（${n}名）`));
    }
    refreshStudent();
  }

  function refreshStudent() {
    if (!tdCurrent) return;
    if (mountStudent) mountStudent.remove();
    mountStudent = build(tdCurrent, parseInt(studentSelect.value, 10));
    wrap.appendChild(mountStudent);
  }

  studentSelect.addEventListener('change', refreshStudent);

  wrap.appendChild(singlePicker(state, td => {
    tdCurrent = td;
    rebuildStudentList();
  }));
  wrap.appendChild(studentRow);
  wrap.appendChild(classPrintRow);

  container.appendChild(wrap);
}

function build(td, idx) {
  const out = el('div');
  const r = td.rows[idx];
  if (!r) return out;

  out.appendChild(el('div', { class: 'callout info' },
    el('strong', null, '👤 個人カルテでわかること'),
    el('br'),
    '選択した生徒の強み・弱み、クラス比較、類似する生徒、ペア学習推奨などを一覧表示します。',
    '保護者面談・三者面談で印刷して使える形式です（右下『個人カルテを印刷』ボタン）。'
  ));
  out.appendChild(explain('zScore'));
  out.appendChild(explain('hiddenRisk'));
  out.appendChild(explain('pairLearning'));

  const peers = ('クラス' in r && r['クラス'] != null)
    ? td.rows.filter(rr => rr['クラス'] === r['クラス'])
    : td.rows;

  const ratiosFull = ratioMatrix(td);
  const myRatios = ratiosFull[idx];
  const classRatio = td.items.map((it, j) => {
    const denom = it.max_score || Math.max(...td.rows.map(x => x[it.name]).filter(Number.isFinite), 1);
    return mean(peers.map(rr => rr[it.name] / denom));
  });
  const gradeRatio = td.items.map((it, j) => {
    const denom = it.max_score || Math.max(...td.rows.map(x => x[it.name]).filter(Number.isFinite), 1);
    return mean(td.rows.map(rr => rr[it.name] / denom));
  });

  const total = r['合計点'];
  const totals = peers.map(p => p['合計点']).filter(Number.isFinite);
  const z = Number.isFinite(total) ? (total - mean(totals)) / (stdev(totals) || 1) : NaN;
  const rank = Number.isFinite(total) ? peers.filter(p => Number.isFinite(p['合計点']) && p['合計点'] > total).length + 1 : NaN;

  out.appendChild(el('div', { class: 'kpi-row' },
    kpi('氏名', displayName(r['氏名'], idx, r['生徒管理コード']), r['生徒管理コード'] || ''),
    kpi('クラス・番号', `${r['クラス'] ?? '?'}-${r['番号'] ?? '?'}`),
    kpi('合計点', Number.isFinite(total) ? total.toFixed(0) : '—',
        `クラス比 ${Number.isFinite(total) ? (total - mean(totals)).toFixed(1) : '—'}`),
    kpi('Zスコア', Number.isFinite(z) ? `${z >= 0 ? '+' : ''}${z.toFixed(2)}` : '—', 'クラス内'),
    kpi('クラス内順位', Number.isFinite(rank) ? `${rank} / ${peers.length}` : '—'),
  ));

  out.appendChild(el('h3', null, '🎯 領域・項目プロファイル（得点率）'));
  out.appendChild(plotEl(
    [
      {
        type: 'scatterpolar',
        r: [...myRatios, myRatios[0]],
        theta: [...td.items.map(i => i.name), td.items[0].name],
        fill: 'toself',
        name: displayName(r['氏名'], idx, r['生徒管理コード']) || '生徒',
        line: { color: '#1e90ff' },
      },
      {
        type: 'scatterpolar',
        r: [...classRatio, classRatio[0]],
        theta: [...td.items.map(i => i.name), td.items[0].name],
        name: 'クラス平均',
        line: { color: '#f59e0b', dash: 'dash' },
      },
      {
        type: 'scatterpolar',
        r: [...gradeRatio, gradeRatio[0]],
        theta: [...td.items.map(i => i.name), td.items[0].name],
        name: '学年平均',
        line: { color: '#94a3b8', dash: 'dot' },
      },
    ],
    { polar: { radialaxis: { visible: true, range: [0, 1] } }, height: 520, margin: { t: 30 } }
  ));

  out.appendChild(el('h3', null, '📊 項目別 得点と得点率'));
  const detailRows = td.items.map((it, j) => {
    const my = myRatios[j], cl = classRatio[j], gr = gradeRatio[j];
    const diff = cl - my;
    return [
      it.name,
      it.unit_name || '—',
      it.domain || '—',
      r[it.name] ?? '—',
      it.max_score || '—',
      fmtPct(my),
      fmtPct(cl),
      fmtPct(gr),
      { v: `${diff > 0 ? '+' : ''}${(diff * 100).toFixed(1)}%`,
        cls: diff > 0.15 ? 'bad' : (diff < -0.15 ? 'good' : '') },
    ];
  });
  out.appendChild(renderTable(
    ['項目', '単元', '領域', '得点', '配点', '得点率', 'クラス平均', '学年平均', '差(クラス-自分)'],
    detailRows,
  ));

  const diffs = myRatios.map((v, j) => ({
    name: td.items[j].name, my: v, diff: v - classRatio[j], abs: v
  }));
  const strengths = diffs.filter(d => d.diff > 0.05).sort((a, b) => b.diff - a.diff).slice(0, 3);
  const weaknesses = diffs.filter(d => d.diff < -0.05).sort((a, b) => a.diff - b.diff).slice(0, 3);
  const lowAbs = diffs.slice().sort((a, b) => a.abs - b.abs).slice(0, 3);

  out.appendChild(el('h3', null, '📝 自動フィードバック'));

  out.appendChild(el('div', { class: 'callout success' },
    el('strong', null, '👍 強み（クラス平均より優れている）'),
    el('br'),
    strengths.length
      ? strengths.map(d => el('div', null,
          `・${d.name}: 得点率 ${fmtPct(d.my)} （クラス比 +${(d.diff * 100).toFixed(0)}%）`))
      : '— 顕著な強みはまだ見えていません。'
  ));

  out.appendChild(el('div', { class: 'callout danger' },
    el('strong', null, '⚠️ 弱み（クラス平均より大きく劣る）'),
    el('br'),
    weaknesses.length
      ? weaknesses.map(d => el('div', null,
          `・${d.name}: 得点率 ${fmtPct(d.my)} （クラス比 ${(d.diff * 100).toFixed(0)}%）`))
      : '— 顕著な弱みはありません。'
  ));

  out.appendChild(el('h3', null, '💌 個別コーチング・コメント（自動生成）'));
  out.appendChild(el('div', { class: 'coach' },
    generateCoachingText(r, strengths, weaknesses, lowAbs, z, rank, peers.length)
  ));

  // Hidden risk: average overall score, but multiple individual items below 50%
  const lowItems = td.items.filter((it, j) => myRatios[j] < 0.5);
  const overallOK = Number.isFinite(z) && z > -0.3;
  if (overallOK && lowItems.length >= 2) {
    out.appendChild(el('div', { class: 'callout warn' },
      el('strong', null, '🔎 隠れリスク検出: '),
      `合計点は普通ですが、基礎項目（${lowItems.slice(0, 3).map(it => it.name).join(', ')}）で取りこぼしがあります。`,
      ' 表面的に見えにくい弱点なので、面談での確認を推奨します。'
    ));
  }

  // Similar students
  out.appendChild(el('h3', null, '🤝 同じ躓き方をしている生徒（参考）'));
  const validProfiles = ratiosFull
    .map((row, i) => row.every(Number.isFinite) ? i : -1)
    .filter(i => i >= 0);
  if (myRatios.every(Number.isFinite)) {
    const dists = validProfiles.map(i => {
      let d = 0;
      for (let j = 0; j < myRatios.length; j++) d += (myRatios[j] - ratiosFull[i][j]) ** 2;
      return { i, d: Math.sqrt(d) };
    }).sort((a, b) => a.d - b.d);
    const similar = dists.filter(x => x.i !== idx).slice(0, 5);
    out.appendChild(renderTable(
      ['氏名', 'クラス', '合計点', 'プロファイル距離'],
      similar.map(x => {
        const rr = td.rows[x.i];
        return [
          displayName(rr['氏名'], x.i, rr['生徒管理コード']),
          rr['クラス'] ?? '—',
          rr['合計点'] ?? '—',
          fmtNum(x.d, 3),
        ];
      })
    ));
    out.appendChild(el('p', { class: 'muted' },
      '距離が小さい＝失点パターンが似ている。グループ指導の組み合わせ参考に。'));
  } else {
    out.appendChild(el('div', { class: 'callout info' }, '欠損があるため類似生徒を計算できませんでした。'));
  }

  // Pair learning suggestion
  out.appendChild(el('h3', null, '🤝 ペア学習推奨（補完的な強みを持つ生徒）'));
  if (myRatios.every(Number.isFinite) && weaknesses.length) {
    const weakIdxs = weaknesses.map(w => td.items.findIndex(it => it.name === w.name));
    const candidates = validProfiles
      .filter(i => i !== idx)
      .map(i => {
        const score = weakIdxs.reduce((s, j) => s + (ratiosFull[i][j] - myRatios[j]), 0);
        return { i, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    out.appendChild(renderTable(
      ['推奨ペア', 'クラス', '補完スコア', '相手の弱み項目得点率'],
      candidates.map(c => {
        const rr = td.rows[c.i];
        return [
          displayName(rr['氏名'], c.i, rr['生徒管理コード']),
          rr['クラス'] ?? '—',
          fmtNum(c.score, 3),
          weakIdxs.map(j => `${td.items[j].name}: ${fmtPct(ratiosFull[c.i][j])}`).join(' / '),
        ];
      })
    ));
    out.appendChild(el('p', { class: 'muted' },
      '補完スコアが大きい＝あなたの弱み項目で得点率が高い相手。教え合いに最適。'));
  } else {
    out.appendChild(el('div', { class: 'callout info' }, '弱みが顕著でないため、ペア推奨はスキップします。'));
  }

  out.appendChild(el('div', { class: 'form-row' },
    el('button', {
      class: 'btn primary',
      onclick: () => window.print(),
    }, el('i', { class: 'fas fa-print' }), ' 個人カルテを印刷')
  ));

  return out;
}

function generateCoachingText(student, strengths, weaknesses, lowAbs, z, rank, peerN) {
  const name = displayName(student['氏名'], null, student['生徒管理コード']) || '生徒';
  const lines = [];
  lines.push(`${name}さんへ — 今回のテストの結果を、データから読み解いてみました。`);
  lines.push('');

  if (Number.isFinite(z)) {
    if (z >= 1) lines.push(`✨ クラス内で上位の成績です（Z=${z.toFixed(2)}, 順位 ${rank}/${peerN}）。この調子を保ちましょう。`);
    else if (z >= 0) lines.push(`📊 クラス平均よりやや上の成績です（Z=${z.toFixed(2)}）。あと一歩、伸びしろがあります。`);
    else if (z >= -1) lines.push(`📉 クラス平均をやや下回っています（Z=${z.toFixed(2)}）。重点項目に絞って復習しましょう。`);
    else lines.push(`🆘 平均から大きく下にいます（Z=${z.toFixed(2)}）。基礎の取りこぼしを一つずつ埋めていけば必ず改善します。`);
  }
  lines.push('');

  if (strengths.length) {
    lines.push('【あなたの強み】');
    for (const s of strengths) {
      lines.push(`  ✓ ${s.name} は得点率 ${fmtPct(s.my)} と、クラス平均より +${(s.diff * 100).toFixed(0)}% も高いです。`);
    }
    lines.push('  → この強みを活かし、関連分野でも自信を持って取り組んでみてください。');
    lines.push('');
  }

  if (weaknesses.length) {
    lines.push('【優先的に取り組みたい弱み】');
    for (const w of weaknesses) {
      lines.push(`  ✗ ${w.name} は得点率 ${fmtPct(w.my)}（クラス比 ${(w.diff * 100).toFixed(0)}%）。`);
    }
    lines.push('  → まずは ' + weaknesses[0].name + ' の基礎事項を1日10分でも復習する習慣をつけましょう。');
    lines.push('');
  }

  const verylow = lowAbs.filter(x => x.my < 0.3);
  if (verylow.length) {
    lines.push('【特に基礎の取りこぼしがある項目】');
    for (const v of verylow) {
      lines.push(`  ⚠️ ${v.name}（得点率 ${fmtPct(v.my)}）— ここは早めにフォローが必要です。`);
    }
    lines.push('');
  }

  lines.push('────────');
  lines.push('💡 次回への一歩:');
  if (weaknesses.length) {
    lines.push(`  ① ${weaknesses[0].name} を中心に基礎問題を10題ずつ解く`);
    lines.push(`  ② 解けない問題は印を付けておき、先生または友達に質問する`);
    lines.push(`  ③ 1週間後にもう一度同じ範囲を解いて、自分の伸びを確認する`);
  } else if (strengths.length) {
    lines.push(`  ① 強みの ${strengths[0].name} で、より発展的な問題に挑戦する`);
    lines.push(`  ② 苦手分野を見つけて基礎を固める`);
  } else {
    lines.push('  ① テスト全体を振り返り、特に間違えた問題のパターンを書き出す');
    lines.push('  ② 同じパターンの基礎問題を集中的に復習する');
  }
  lines.push('');
  lines.push('小さな積み重ねが、必ず次の結果につながります。応援しています！');
  return lines.join('\n');
}

// =========================================================================
// Class-batch printing — generates a self-contained DOM with one student per
// 2 A4 pages, then triggers window.print(). Uses synchronous SVG radar chart
// (Plotly is too heavy for many parallel renders during print).
// =========================================================================

function buildRadarSVG(items, myRatios, classRatios, gradeRatios, opts = {}) {
  const w = opts.width || 420;
  const h = opts.height || 360;
  const cx = w / 2, cy = h / 2 - 6;
  const r = Math.min(cx, cy) - 64;
  const n = items.length;
  if (n === 0) return null;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.classList.add('print-radar');

  for (const ratio of [0.25, 0.5, 0.75, 1.0]) {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', cx);
    c.setAttribute('cy', cy);
    c.setAttribute('r', r * ratio);
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', '#cbd5e1');
    c.setAttribute('stroke-width', ratio === 1 ? 1.2 : 0.6);
    if (ratio < 1) c.setAttribute('stroke-dasharray', '2 2');
    svg.appendChild(c);
  }

  const angleFor = i => -Math.PI / 2 + (2 * Math.PI * i) / n;
  for (let i = 0; i < n; i++) {
    const a = angleFor(i);
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', cx);
    line.setAttribute('y1', cy);
    line.setAttribute('x2', x);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', '#cbd5e1');
    line.setAttribute('stroke-width', 0.5);
    svg.appendChild(line);

    const lx = cx + (r + 18) * Math.cos(a);
    const ly = cy + (r + 18) * Math.sin(a);
    const tx = document.createElementNS(ns, 'text');
    tx.setAttribute('x', lx);
    tx.setAttribute('y', ly);
    tx.setAttribute('font-size', '10');
    tx.setAttribute('text-anchor', 'middle');
    tx.setAttribute('dominant-baseline', 'middle');
    tx.setAttribute('fill', '#1e293b');
    const label = items[i].unit_name ? items[i].unit_name : items[i].name;
    const truncated = String(label).length > 9 ? String(label).slice(0, 9) + '…' : label;
    tx.textContent = truncated;
    svg.appendChild(tx);
  }

  const makePoly = (ratios, fill, stroke, dash) => {
    if (!ratios || !ratios.every(Number.isFinite)) return null;
    const pts = ratios.map((v, i) => {
      const a = angleFor(i);
      const rr = Math.max(0, Math.min(1, v)) * r;
      return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
    }).join(' ');
    const p = document.createElementNS(ns, 'polygon');
    p.setAttribute('points', pts);
    p.setAttribute('fill', fill);
    p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', '1.4');
    if (dash) p.setAttribute('stroke-dasharray', dash);
    return p;
  };

  const gp = makePoly(gradeRatios, 'rgba(148,163,184,0.10)', '#94a3b8', '2 2');
  const cp = makePoly(classRatios, 'rgba(245,158,11,0.10)', '#f59e0b', '4 3');
  const mp = makePoly(myRatios, 'rgba(30,144,255,0.20)', '#1e90ff', null);
  if (gp) svg.appendChild(gp);
  if (cp) svg.appendChild(cp);
  if (mp) svg.appendChild(mp);

  // Legend
  const ly = h - 8;
  const legend = [
    { label: '本人', color: '#1e90ff' },
    { label: 'クラス平均', color: '#f59e0b' },
    { label: '学年平均', color: '#94a3b8' },
  ];
  legend.forEach((it, i) => {
    const x = 14 + i * 110;
    const sw = document.createElementNS(ns, 'rect');
    sw.setAttribute('x', x);
    sw.setAttribute('y', ly - 9);
    sw.setAttribute('width', '11');
    sw.setAttribute('height', '11');
    sw.setAttribute('fill', it.color);
    svg.appendChild(sw);
    const tx = document.createElementNS(ns, 'text');
    tx.setAttribute('x', x + 16);
    tx.setAttribute('y', ly);
    tx.setAttribute('font-size', '10');
    tx.setAttribute('fill', '#1e293b');
    tx.textContent = it.label;
    svg.appendChild(tx);
  });

  return svg;
}

function buildPrintTable(headers, rows) {
  const wrap = el('div', { class: 'print-table-wrap' });
  const table = el('table', { class: 'print-table' });
  const thead = el('thead');
  const trh = el('tr');
  for (const h of headers) trh.appendChild(el('th', null, h));
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    for (const cell of row) {
      let v = cell, cls = '';
      if (cell && typeof cell === 'object' && 'v' in cell) { v = cell.v; cls = cell.cls || ''; }
      const td2 = el('td', { class: cls }, v == null ? '—' : String(v));
      tr.appendChild(td2);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function miniKpi(label, value, sub) {
  return el('div', { class: 'print-mini-kpi' },
    el('div', { class: 'print-mini-kpi-label' }, label),
    el('div', { class: 'print-mini-kpi-value' }, String(value)),
    sub ? el('div', { class: 'print-mini-kpi-sub' }, String(sub)) : null,
  );
}

function buildPrintCardFor(td, idx, ratiosFull) {
  const r = td.rows[idx];
  if (!r) return null;

  const peers = ('クラス' in r && r['クラス'] != null)
    ? td.rows.filter(rr => rr['クラス'] === r['クラス'])
    : td.rows;

  const myRatios = ratiosFull[idx];
  const classRatio = td.items.map((it) => {
    const denom = it.max_score || Math.max(...td.rows.map(x => x[it.name]).filter(Number.isFinite), 1);
    return mean(peers.map(rr => rr[it.name] / denom));
  });
  const gradeRatio = td.items.map((it) => {
    const denom = it.max_score || Math.max(...td.rows.map(x => x[it.name]).filter(Number.isFinite), 1);
    return mean(td.rows.map(rr => rr[it.name] / denom));
  });

  const total = r['合計点'];
  const totals = peers.map(p => p['合計点']).filter(Number.isFinite);
  const z = Number.isFinite(total) ? (total - mean(totals)) / (stdev(totals) || 1) : NaN;
  const rank = Number.isFinite(total)
    ? peers.filter(p => Number.isFinite(p['合計点']) && p['合計点'] > total).length + 1
    : NaN;

  const diffs = myRatios.map((v, j) => ({
    name: td.items[j].name, my: v, diff: v - classRatio[j], abs: v
  }));
  const strengths = diffs.filter(d => d.diff > 0.05).sort((a, b) => b.diff - a.diff).slice(0, 3);
  const weaknesses = diffs.filter(d => d.diff < -0.05).sort((a, b) => a.diff - b.diff).slice(0, 3);
  const lowAbs = diffs.slice().sort((a, b) => a.abs - b.abs).slice(0, 3);

  const studentName = displayName(r['氏名'], idx, r['生徒管理コード']);
  const studentBox = el('div', { class: 'print-student' });

  // ---------- Page 1 ----------
  const page1 = el('section', { class: 'print-page page-1' });
  page1.appendChild(el('header', { class: 'print-head' },
    el('div', { class: 'print-title' }, '個人カルテ'),
    el('div', { class: 'print-test' }, td.test_id),
  ));
  page1.appendChild(el('div', { class: 'print-subhead' },
    el('span', null, el('strong', null, '氏名: '), studentName),
    el('span', null, el('strong', null, 'クラス・番号: '), `${r['クラス'] ?? '—'}-${r['番号'] ?? '—'}`),
    el('span', null, el('strong', null, '生徒管理コード: '), r['生徒管理コード'] || '—'),
  ));

  page1.appendChild(el('div', { class: 'print-kpi-row' },
    miniKpi('合計点', Number.isFinite(total) ? total.toFixed(0) : '—',
            Number.isFinite(total) ? `クラス比 ${(total - mean(totals)).toFixed(1)}` : null),
    miniKpi('Zスコア', Number.isFinite(z) ? `${z >= 0 ? '+' : ''}${z.toFixed(2)}` : '—', 'クラス内'),
    miniKpi('クラス内順位', Number.isFinite(rank) ? `${rank} / ${peers.length}` : '—'),
    miniKpi('小問数', String(td.items.length), '評価対象'),
  ));

  page1.appendChild(el('h3', { class: 'print-h' }, '🎯 領域・項目プロファイル'));
  const radarWrap = el('div', { class: 'print-radar-wrap' });
  const svg = buildRadarSVG(td.items, myRatios, classRatio, gradeRatio, { width: 420, height: 350 });
  if (svg) radarWrap.appendChild(svg);
  page1.appendChild(radarWrap);

  page1.appendChild(el('h3', { class: 'print-h' }, '📊 項目別 得点と得点率'));
  page1.appendChild(buildPrintTable(
    ['項目', '単元', '領域', '得点', '配点', '得点率', 'クラス平均', '差(クラス-自分)'],
    td.items.map((it, j) => {
      const my = myRatios[j], cl = classRatio[j];
      const diff = cl - my;
      const cls = diff > 0.15 ? 'bad' : (diff < -0.15 ? 'good' : '');
      return [
        it.name,
        it.unit_name || '—',
        it.domain || '—',
        Number.isFinite(r[it.name]) ? r[it.name] : '—',
        it.max_score || '—',
        fmtPct(my),
        fmtPct(cl),
        { v: `${diff > 0 ? '+' : ''}${(diff * 100).toFixed(1)}%`, cls },
      ];
    })
  ));

  studentBox.appendChild(page1);

  // ---------- Page 2 ----------
  const page2 = el('section', { class: 'print-page page-2' });
  page2.appendChild(el('header', { class: 'print-head' },
    el('div', { class: 'print-title' }, '個人カルテ（続き）'),
    el('div', { class: 'print-test' }, `${studentName} / ${td.test_id}`),
  ));

  page2.appendChild(el('h3', { class: 'print-h' }, '👍 強み（クラス平均より優れている）'));
  if (strengths.length) {
    const ul = el('ul', { class: 'print-list good' });
    for (const d of strengths) {
      ul.appendChild(el('li', null,
        `${d.name}: 得点率 ${fmtPct(d.my)} （クラス比 +${(d.diff * 100).toFixed(0)}%）`));
    }
    page2.appendChild(ul);
  } else {
    page2.appendChild(el('p', { class: 'print-muted' }, '— 顕著な強みはまだ見えていません。'));
  }

  page2.appendChild(el('h3', { class: 'print-h' }, '⚠️ 弱み（クラス平均より大きく劣る）'));
  if (weaknesses.length) {
    const ul = el('ul', { class: 'print-list bad' });
    for (const d of weaknesses) {
      ul.appendChild(el('li', null,
        `${d.name}: 得点率 ${fmtPct(d.my)} （クラス比 ${(d.diff * 100).toFixed(0)}%）`));
    }
    page2.appendChild(ul);
  } else {
    page2.appendChild(el('p', { class: 'print-muted' }, '— 顕著な弱みはありません。'));
  }

  // Hidden risk
  const lowItems = td.items.filter((it, j) => myRatios[j] < 0.5);
  const overallOK = Number.isFinite(z) && z > -0.3;
  if (overallOK && lowItems.length >= 2) {
    page2.appendChild(el('div', { class: 'print-warn' },
      el('strong', null, '🔎 隠れリスク: '),
      `合計点は普通ですが、基礎項目（${lowItems.slice(0, 3).map(it => it.name).join(', ')}）に取りこぼしあり。`,
    ));
  }

  page2.appendChild(el('h3', { class: 'print-h' }, '💌 個別コーチング・コメント'));
  page2.appendChild(el('div', { class: 'print-coach' },
    generateCoachingText(r, strengths, weaknesses, lowAbs, z, rank, peers.length)
  ));

  // Similar students top-3
  if (myRatios.every(Number.isFinite)) {
    const validProfiles = ratiosFull
      .map((row, i) => row.every(Number.isFinite) ? i : -1)
      .filter(i => i >= 0);
    const dists = validProfiles.map(i => {
      let d = 0;
      for (let j = 0; j < myRatios.length; j++) d += (myRatios[j] - ratiosFull[i][j]) ** 2;
      return { i, d: Math.sqrt(d) };
    }).sort((a, b) => a.d - b.d);
    const similar = dists.filter(x => x.i !== idx).slice(0, 3);
    if (similar.length) {
      page2.appendChild(el('h3', { class: 'print-h' }, '🤝 似た失点パターンの生徒（上位3名）'));
      page2.appendChild(buildPrintTable(
        ['氏名', 'クラス', '合計点', 'プロファイル距離'],
        similar.map(x => {
          const rr = td.rows[x.i];
          return [
            displayName(rr['氏名'], x.i, rr['生徒管理コード']),
            rr['クラス'] ?? '—',
            Number.isFinite(rr['合計点']) ? rr['合計点'] : '—',
            fmtNum(x.d, 3),
          ];
        })
      ));
    }

    if (weaknesses.length) {
      const weakIdxs = weaknesses.map(w => td.items.findIndex(it => it.name === w.name));
      const candidates = validProfiles
        .filter(i => i !== idx)
        .map(i => {
          const score = weakIdxs.reduce((s, j) => s + (ratiosFull[i][j] - myRatios[j]), 0);
          return { i, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      page2.appendChild(el('h3', { class: 'print-h' }, '🤝 ペア学習推奨（補完的な強みを持つ生徒）'));
      page2.appendChild(buildPrintTable(
        ['推奨ペア', 'クラス', '補完スコア'],
        candidates.map(c => {
          const rr = td.rows[c.i];
          return [
            displayName(rr['氏名'], c.i, rr['生徒管理コード']),
            rr['クラス'] ?? '—',
            fmtNum(c.score, 3),
          ];
        })
      ));
    }
  }

  page2.appendChild(el('footer', { class: 'print-foot' },
    `easy Exam Insight | 出力日: ${new Date().toLocaleDateString('ja-JP')} | ${studentName}`
  ));

  studentBox.appendChild(page2);
  return studentBox;
}

function printClassReports(td, classValue) {
  const rows = td.rows;
  let targets;
  if (classValue === '__all__') {
    targets = rows.map((_, i) => i);
  } else {
    targets = rows
      .map((r, i) => String(r['クラス']) === String(classValue) ? i : -1)
      .filter(i => i >= 0);
  }
  if (!targets.length) {
    alert('対象生徒がいません。');
    return;
  }

  // Stable sort by 番号 then 氏名 for reproducible output
  targets.sort((a, b) => {
    const ra = rows[a], rb = rows[b];
    const na = Number(ra['番号']), nb = Number(rb['番号']);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(ra['氏名'] || '').localeCompare(String(rb['氏名'] || ''));
  });

  const ratiosFull = ratioMatrix(td);

  const old = document.getElementById('class-print-area');
  if (old) old.remove();
  const area = el('div', { id: 'class-print-area' });

  const headerLabel = (classValue === '__all__') ? '全クラス' : `クラス ${classValue}`;
  area.appendChild(el('div', { class: 'print-area-banner' },
    el('span', null, `📋 個人カルテ一括印刷  (${headerLabel}・${targets.length}名分)`),
    el('span', null, td.test_id),
  ));

  for (const idx of targets) {
    const card = buildPrintCardFor(td, idx, ratiosFull);
    if (card) area.appendChild(card);
  }

  document.body.appendChild(area);

  // Wait for two animation frames so layout settles, then print.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
      const cleanup = () => {
        const node = document.getElementById('class-print-area');
        if (node) node.remove();
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      // Fallback for browsers that don't fire afterprint
      setTimeout(cleanup, 60_000);
    });
  });
}

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

  function rebuildStudentList() {
    studentSelect.innerHTML = '';
    if (!tdCurrent) return;
    tdCurrent.rows.forEach((r, i) => {
      const cls = r['クラス'] ?? '?';
      const no = r['番号'] ?? '?';
      const name = displayName(r['氏名'], i, r['生徒管理コード']);
      studentSelect.appendChild(el('option', { value: i },
        `${cls}-${String(no).padStart(2, ' ')} ${name}`));
    });
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

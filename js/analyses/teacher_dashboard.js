// Teacher dashboard — re-teach priority, class comparisons, support list
// =========================================================================
import { el, kpi, plotEl, renderTable, mean, stdev, corr, fmtPct, fmtNum, downloadXLSX } from '../utils.js?v=5';
import { singlePicker } from '../picker.js?v=5';
import { ratioMatrix } from '../loader.js?v=5';
import { explain, helpBox, howToRead } from '../help.js?v=5';

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
  if (!td.items.length) return out;

  out.appendChild(el('div', { class: 'callout info' },
    el('strong', null, '🎓 教員ダッシュボードでわかること'),
    el('br'),
    '次の授業で再指導すべき項目、クラス間の差、要支援生徒のリストを自動生成します。',
    '「本日の指導テーマ」を毎回見て授業準備に活かしてください。'
  ));
  out.appendChild(explain('reteachPriority'));
  const df = td.rows;
  const itemNames = td.items.map(i => i.name);
  const ratios = ratioMatrix(td);
  const totals = df.map(r => itemNames.reduce((s, c) => s + (Number.isFinite(r[c]) ? r[c] : 0), 0));

  out.appendChild(el('h3', null, '🚨 再指導推奨ランキング'));
  out.appendChild(el('p', { class: 'muted' },
    '全体得点率が低く、識別力（合計点との相関）が高い項目は「重要かつ抜けている」=教えれば伸びる項目です。'));

  const priorityRows = [];
  for (let j = 0; j < td.items.length; j++) {
    const it = td.items[j];
    const rate = mean(ratios.map(r => r[j]));
    const x = df.map(r => r[it.name]);
    const rest = df.map((_, i) => totals[i] - (Number.isFinite(df[i][it.name]) ? df[i][it.name] : 0));
    const r = corr(x, rest);
    const score = (1 - rate) * (Number.isFinite(r) ? r : 0);
    priorityRows.push({
      name: it.name,
      domain: it.domain,
      unit_name: it.unit_name,
      rate, r, score,
      ach: ratios.filter(row => row[j] >= 0.6).length,
      noAch: ratios.filter(row => row[j] < 0.6).length,
    });
  }
  priorityRows.sort((a, b) => b.score - a.score);
  out.appendChild(renderTable(
    ['項目', '単元', '領域', '全体得点率', '識別力', '再指導優先度', '達成生徒数(≥60%)', '未達成生徒数(<60%)'],
    priorityRows.map(p => [
      p.name,
      p.unit_name || '—',
      p.domain || '—',
      fmtPct(p.rate),
      fmtNum(p.r, 3),
      { v: fmtNum(p.score, 3), cls: p.score >= 0.3 ? 'bad' : (p.score >= 0.15 ? 'warn' : '') },
      p.ach,
      p.noAch,
    ])
  ));

  const classes = [...new Set(df.map(r => r['クラス']).filter(v => v != null))].sort();
  if (classes.length >= 2) {
    out.appendChild(el('h3', null, '🏫 クラス別 平均得点比較'));
    const traces = classes.map(c => ({
      type: 'box',
      y: df.filter(r => r['クラス'] === c).map(r => r['合計点']).filter(Number.isFinite),
      name: `クラス${c}`,
      boxpoints: 'all', jitter: 0.3, pointpos: 0,
    }));
    out.appendChild(plotEl(traces, { yaxis: { title: '合計点' }, height: 420, margin: { t: 20 } }));

    const groups = classes.map(c => df.filter(r => r['クラス'] === c).map(r => r['合計点']).filter(Number.isFinite));
    const grandMean = mean(groups.flat());
    const ssB = groups.reduce((s, g) => s + g.length * (mean(g) - grandMean) ** 2, 0);
    const ssW = groups.reduce((s, g) => s + g.reduce((a, x) => a + (x - mean(g)) ** 2, 0), 0);
    const dfB = groups.length - 1;
    const dfW = groups.flat().length - groups.length;
    const F = (ssB / dfB) / (ssW / dfW || 1);
    const p = typeof jStat !== 'undefined' && jStat.centralF
      ? 1 - jStat.centralF.cdf(F, dfB, dfW)
      : NaN;
    out.appendChild(el('div', { class: 'callout info' },
      `クラス間ANOVA: F=${F.toFixed(3)}, p=${Number.isFinite(p) ? p.toFixed(4) : '—'}  ⇒ `,
      el('strong', null, Number.isFinite(p) && p < 0.05 ? 'クラス間で有意差あり' : '有意差なし')
    ));

    out.appendChild(el('h3', null, '🌡️ クラス × 項目 平均得点率（学年平均との差）'));
    const overall = itemNames.map((_, j) => mean(ratios.map(row => row[j])));
    const z = [], txt = [];
    for (const c of classes) {
      const row = [], trow = [];
      for (let j = 0; j < td.items.length; j++) {
        const subset = df.filter(r => r['クラス'] === c).map(r => {
          const denom = td.items[j].max_score || Math.max(...df.map(rr => rr[itemNames[j]]).filter(Number.isFinite), 1);
          return r[itemNames[j]] / denom;
        }).filter(Number.isFinite);
        const rate = mean(subset);
        const diff = rate - overall[j];
        row.push(diff);
        trow.push(`${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(1)}%`);
      }
      z.push(row); txt.push(trow);
    }
    out.appendChild(plotEl(
      [{
        type: 'heatmap',
        z, x: itemNames, y: classes.map(c => `クラス${c}`),
        text: txt, texttemplate: '%{text}',
        colorscale: 'RdBu', zmid: 0, zmin: -0.3, zmax: 0.3,
        colorbar: { title: '差' },
      }],
      { height: 120 + classes.length * 50, margin: { l: 80, r: 40, t: 20, b: 80 } }
    ));
    out.appendChild(el('p', { class: 'muted' },
      '赤=学年平均より低い（再指導必要）、青=学年平均より得意。'));
  }

  out.appendChild(el('h3', null, '⚠️ 要支援生徒（合計点が下位 + 重要項目で苦戦）'));
  const topPriority = priorityRows.slice(0, 3).map(p => p.name);
  const topPriorityIdx = topPriority.map(n => itemNames.indexOf(n));
  const totalsArr = df.map(x => x['合計点']).filter(Number.isFinite);
  const tMu = mean(totalsArr), tSd = stdev(totalsArr) || 1;
  const support = df.map((r, i) => {
    const z = (r['合計点'] - tMu) / tSd;
    const focusRate = mean(topPriorityIdx.map(j => ratios[i][j]));
    return { i, z, focusRate, r };
  }).filter(x => Number.isFinite(x.z)).sort((a, b) => a.z - b.z || a.focusRate - b.focusRate);

  const nShow = 15;
  out.appendChild(renderTable(
    ['生徒管理コード', '氏名', 'クラス', '番号', '合計点', 'Z', '重要項目得点率'],
    support.slice(0, nShow).map(s => [
      s.r['生徒管理コード'] || '—',
      s.r['氏名'] || '—',
      s.r['クラス'] ?? '—',
      s.r['番号'] ?? '—',
      s.r['合計点'] ?? '—',
      fmtNum(s.z, 2),
      fmtPct(s.focusRate),
    ])
  ));

  out.appendChild(el('h3', null, '🎯 本日の指導テーマ（自動提案）'));
  const top1 = priorityRows[0];
  out.appendChild(el('div', { class: 'coach' },
    `次の授業で扱うとよい優先テーマは「${top1.name}」（${top1.domain || ''}）です。\n\n` +
    `現在の全体得点率は ${fmtPct(top1.rate)}、識別力は ${fmtNum(top1.r, 2)}。\n` +
    `「教えれば伸びる」可能性が最も高い項目です。\n\n` +
    `📌 推奨アクション:\n` +
    `  ① 該当範囲の基礎をミニ復習（10〜15分）\n` +
    `  ② 達成済み生徒（${top1.ach}名）に説明役をお願いし、ペア学習\n` +
    `  ③ 未達成生徒（${top1.noAch}名）には個別フォロー時間を設定`
  ));

  out.appendChild(el('h3', null, '📥 教員レポート ダウンロード'));
  out.appendChild(el('div', { class: 'form-row' },
    el('button', {
      class: 'btn primary',
      onclick: () => downloadXLSX(`teacher_report_${td.test_id}.xlsx`, {
        '再指導優先度': {
          headers: ['項目', '単元', '領域', '全体得点率', '識別力', '再指導優先度', '達成', '未達成'],
          rows: priorityRows.map(p => [p.name, p.unit_name || '', p.domain || '', p.rate, p.r, p.score, p.ach, p.noAch]),
        },
        '要支援生徒': {
          headers: ['生徒管理コード', '氏名', 'クラス', '番号', '合計点', 'Z', '重要項目得点率'],
          rows: support.slice(0, 30).map(s => [
            s.r['生徒管理コード'], s.r['氏名'], s.r['クラス'], s.r['番号'],
            s.r['合計点'], s.z, s.focusRate,
          ]),
        },
      }),
    }, el('i', { class: 'fas fa-file-excel' }), ' Excelダウンロード')
  ));

  return out;
}

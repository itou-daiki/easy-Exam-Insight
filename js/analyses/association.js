// Association — discover linked struggle patterns
// =========================================================================
import { el, plotEl, renderTable, corr, fmtPct, fmtNum } from '../utils.js?v=5';
import { singlePicker } from '../picker.js?v=5';
import { ratioMatrix } from '../loader.js?v=5';
import { apriori } from '../ml.js?v=5';
import { helpBox, howToRead, explain } from '../help.js?v=5';

export function render(container, state) {
  const wrap = el('div');
  let tdCurrent = null, mount;
  const refresh = () => {
    if (!tdCurrent) return;
    if (mount) mount.remove();
    mount = build(
      tdCurrent,
      parseFloat(thresInput.value),
      modeSel.value,
      parseFloat(supInput.value),
      parseFloat(confInput.value),
      parseFloat(liftInput.value),
      parseFloat(corrInput.value)
    );
    wrap.appendChild(mount);
  };
  wrap.appendChild(singlePicker(state, td => { tdCurrent = td; refresh(); }));

  const controls = el('div', { class: 'form-row' });
  const thresInput = el('input', { type: 'number', step: 0.05, min: 0.1, max: 0.9, value: 0.6, style: { width: '80px' } });
  const modeSel = el('select');
  modeSel.appendChild(el('option', { value: 'low' }, '苦手 (得点率 < 閾値)'));
  modeSel.appendChild(el('option', { value: 'high' }, '得意 (得点率 ≥ 閾値)'));
  const supInput = el('input', { type: 'number', step: 0.01, min: 0.05, max: 0.6, value: 0.15, style: { width: '80px' } });
  const confInput = el('input', { type: 'number', step: 0.05, min: 0.3, max: 0.99, value: 0.6, style: { width: '80px' } });
  const liftInput = el('input', { type: 'number', step: 0.1, min: 1.0, max: 3.0, value: 1.2, style: { width: '80px' } });
  const corrInput = el('input', { type: 'number', step: 0.05, min: 0.0, max: 0.95, value: 0.3, style: { width: '80px' } });

  controls.appendChild(el('label', null, '閾値', thresInput));
  controls.appendChild(el('label', null, '対象', modeSel));
  controls.appendChild(el('label', null, '最小支持度', supInput));
  controls.appendChild(el('label', null, '最小確信度', confInput));
  controls.appendChild(el('label', null, '最小リフト', liftInput));
  controls.appendChild(el('label', null, 'NW相関閾値', corrInput));
  controls.appendChild(el('button', { class: 'btn primary', onclick: refresh },
    el('i', { class: 'fas fa-sync' }), ' 再計算'));
  wrap.appendChild(controls);

  container.appendChild(wrap);
}

function build(td, threshold, mode, minSup, minConf, minLift, corrThres) {
  const out = el('div');
  if (td.items.length < 2) {
    out.appendChild(el('div', { class: 'callout warn' }, '小問が2つ以上必要です'));
    return out;
  }

  // ===== Plain-language overview at the top =====
  out.appendChild(el('div', { class: 'callout info' },
    el('strong', null, '🎯 この分析でわかること'),
    el('br'),
    '「Aの問題でつまずく生徒は、Bの問題でもつまずく」のような、',
    el('strong', null, '生徒の躓きの連鎖'),
    'を発見します。',
    el('br'),
    el('br'),
    '例えば「小計1（基礎計算）が苦手な生徒の80%は、小計3（応用問題）でも苦手」のような',
    'ルールが見つかれば、',
    el('strong', null, '応用問題ができない原因が基礎計算にある'),
    '可能性が示唆されます。',
    el('br'),
    'こうした連鎖を知ることで、',
    el('strong', null, '「どこから教え直すべきか」'),
    'の優先順位が明確になります。'
  ));

  out.appendChild(howToRead([
    el('span', null, el('strong', null, '前提・結論'), ' …「Aで苦手 → Bでも苦手」のAが前提、Bが結論。'),
    el('span', null, el('strong', null, '支持度（support）'), ' …全生徒の何%が「前提と結論を両方とも満たす」か。'),
    el('span', null, el('strong', null, '確信度（confidence）'), ' …前提を満たす生徒のうち、何%が結論も満たすか。'),
    el('span', null, el('strong', null, 'リフト（lift）'), ' …偶然の何倍くらい強い関連か。1.2以上で意味のある連鎖。'),
  ]));

  out.appendChild(explain('association'));

  const ratios = ratioMatrix(td);
  const itemNames = td.items.map(i => i.name);

  const transactions = ratios.map(row => {
    const t = new Set();
    row.forEach((v, j) => {
      if (!Number.isFinite(v)) return;
      if (mode === 'low' && v < threshold) t.add(itemNames[j]);
      else if (mode === 'high' && v >= threshold) t.add(itemNames[j]);
    });
    return t;
  });
  const label = mode === 'low' ? '苦手' : '得意';

  out.appendChild(el('h3', null, `🔥 ${label}項目同士の同時発生数`));
  const N = itemNames.length;
  const co = Array.from({ length: N }, () => new Array(N).fill(0));
  for (const t of transactions) {
    const arr = [...t];
    for (const a of arr) for (const b of arr) {
      if (a === b) continue;
      const i = itemNames.indexOf(a), j = itemNames.indexOf(b);
      co[i][j] += 1;
    }
  }
  out.appendChild(plotEl(
    [{
      type: 'heatmap',
      z: co, x: itemNames, y: itemNames,
      text: co, texttemplate: '%{text}',
      colorscale: 'Reds',
      colorbar: { title: `両方${label}` },
    }],
    { height: 100 + N * 32, margin: { l: 110, r: 40, t: 20, b: 110 } }
  ));

  out.appendChild(el('h3', null, `📜 アソシエーション・ルール（${label}）`));
  const { rules } = apriori(transactions, minSup, 3);
  const filtered = rules.filter(r => r.confidence >= minConf && r.lift >= minLift);
  if (!filtered.length) {
    out.appendChild(el('div', { class: 'callout warn' },
      '条件を満たすルールがありません — 閾値を緩めてください'));
  } else {
    const rows = filtered.slice(0, 50).map(r => [
      r.ant.join(' & '),
      r.cons.join(' & '),
      fmtPct(r.support),
      fmtPct(r.confidence),
      fmtNum(r.lift, 2),
      r.count,
    ]);
    out.appendChild(renderTable(
      [`前提(${label})`, `結論(${label})`, '支持度', '確信度', 'リフト', '人数'],
      rows
    ));

    // Plain-language narrative for the top rule
    const top = filtered[0];
    if (top) {
      const ant = top.ant.join('・');
      const cons = top.cons.join('・');
      out.appendChild(el('div', { class: 'callout success' },
        el('strong', null, '💡 一番強い連鎖: '),
        el('br'),
        `「`,
        el('strong', null, ant),
        `」が${label}の生徒のうち、`,
        el('strong', null, `${(top.confidence * 100).toFixed(0)}%`),
        `（${top.count}名）が「`,
        el('strong', null, cons),
        `」も${label}でした。`,
        el('br'),
        `偶然の起こりやすさの`,
        el('strong', null, `${top.lift.toFixed(2)}倍`),
        `の強さで連鎖しています（リフト＝${top.lift.toFixed(2)}）。`,
        el('br'), el('br'),
        el('strong', null, '👉 教育的示唆: '),
        mode === 'low'
          ? `「${ant}」をマスターすれば、「${cons}」もできるようになる可能性が高いです。指導の優先順位として「${ant}」を先に。`
          : `「${ant}」が得意な生徒は「${cons}」も得意な傾向。同じ思考プロセスを使う問題群かもしれません。`
      ));
    }
  }

  out.appendChild(el('h3', null, '🔗 項目相関ネットワーク'));
  const corrM = Array.from({ length: N }, () => new Array(N).fill(NaN));
  for (let i = 0; i < N; i++) for (let j = i; j < N; j++) {
    if (i === j) { corrM[i][j] = 1; continue; }
    const a = td.rows.map(r => r[itemNames[i]]);
    const b = td.rows.map(r => r[itemNames[j]]);
    const r = corr(a, b);
    corrM[i][j] = corrM[j][i] = r;
  }
  const edges = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const r = corrM[i][j];
    if (Number.isFinite(r) && Math.abs(r) >= corrThres) edges.push({ a: i, b: j, r });
  }
  if (!edges.length) {
    out.appendChild(el('div', { class: 'callout info' }, 'NW相関閾値を下げてください — エッジがありません'));
  } else {
    const angles = itemNames.map((_, i) => (2 * Math.PI * i) / N);
    const xs = angles.map(a => Math.cos(a));
    const ys = angles.map(a => Math.sin(a));
    const edgeX = [], edgeY = [];
    for (const e of edges) {
      edgeX.push(xs[e.a], xs[e.b], null);
      edgeY.push(ys[e.a], ys[e.b], null);
    }
    out.appendChild(plotEl(
      [
        {
          x: edgeX, y: edgeY, mode: 'lines', type: 'scatter',
          line: { color: '#94a3b8', width: 1.5 }, hoverinfo: 'skip', showlegend: false,
        },
        {
          x: xs, y: ys, mode: 'markers+text', type: 'scatter',
          text: itemNames, textposition: 'top center',
          marker: { size: 28, color: '#1e90ff', line: { color: '#fff', width: 2 } },
          showlegend: false,
        },
      ],
      {
        xaxis: { visible: false }, yaxis: { visible: false },
        height: 540, margin: { l: 20, r: 20, t: 30, b: 20 },
      }
    ));
    const edgeRows = edges.slice().sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).map(e => [
      itemNames[e.a], itemNames[e.b], fmtNum(e.r, 3),
    ]);
    out.appendChild(renderTable(['項目A', '項目B', '相関係数'], edgeRows));
  }

  return out;
}

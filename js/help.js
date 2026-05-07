// Interpretation aid widgets — designed for teachers who aren't statisticians.
// =========================================================================
import { el } from './utils.js?v=4';

/**
 * Collapsible help block. Closed by default. Click to expand.
 */
export function helpBox(title, body, opts = {}) {
  const det = el('details', { class: 'help-detail' + (opts.open ? ' open' : '') });
  if (opts.open) det.setAttribute('open', '');
  det.appendChild(el('summary', null, '❓ ' + title));
  const wrap = el('div', { class: 'help-body' });
  const items = Array.isArray(body) ? body : [body];
  for (const item of items) {
    if (typeof item === 'string') {
      const lines = item.split('\n');
      for (const line of lines) wrap.appendChild(el('p', null, line));
    } else if (item instanceof HTMLElement) {
      wrap.appendChild(item);
    }
  }
  det.appendChild(wrap);
  return det;
}

/**
 * "How to read" inline guide.
 */
export function howToRead(items) {
  const ul = el('ul', { class: 'how-to-read' });
  for (const item of items) ul.appendChild(el('li', null, item));
  return el('div', { class: 'callout info' },
    el('strong', null, '👀 このグラフ・表の読み方'),
    ul,
  );
}

// =========================================================================
// Predefined glossary entries (teacher-friendly Japanese)
// =========================================================================
export const GLOSSARY = {
  difficulty: {
    title: '困難度 p（item difficulty）',
    full: [
      '【意味】 全生徒の平均得点を配点で割った値。0〜1で、1に近いほど多くの生徒が解けた問題。',
      '【目安】 0.3未満：難しすぎる／0.85超：易しすぎる（差がつかない）／0.5前後が理想。',
      '【教育的活用】 0.85超は次回の出題でレベルアップを検討、0.3未満は前提知識の確認や問題文の改善を。',
    ],
  },
  discrimination: {
    title: '識別力（項目-合計相関 / D指数）',
    full: [
      '【意味】 その問題が「できる生徒とできない生徒をどれだけうまく区別できたか」を表す指標。',
      '【項目-合計相関】 その項目の得点と「総合点 − その項目」の相関係数。0.4以上で良問。',
      '【D指数】 上位27% − 下位27% の平均差（配点で正規化）。0.2未満は要改善、0.4以上で良問。',
      '【教育的活用】 識別力が低い問題は当てずっぽうで解けたり、全員が解けない可能性。出題の見直し候補。',
    ],
  },
  alpha: {
    title: 'Cronbach α（クロンバッハの α）',
    full: [
      '【意味】 テスト全体の「内部一貫性（似た能力を測れているか）」を表す係数。0〜1の値。',
      '【目安】 0.7以上：信頼性あり／0.8以上：高信頼／0.5未満は設計の見直しを推奨。',
      '【注意】 αは項目数に依存します。項目数が多いほど高くなりやすいので、併せて評価を。',
    ],
  },
  alphaIfDeleted: {
    title: 'α-if-deleted（その項目を除いたときのα）',
    full: [
      '【意味】 ある項目を除外したときの α を再計算した値。',
      '【見方】 現在のα より高い項目は「テスト全体の一貫性を下げている可能性」のある項目。出題改善の候補。',
      '【注意】 α だけで「悪い問題」と判断せず、識別力・困難度と併せて総合判断を。',
    ],
  },
  zScore: {
    title: 'Z スコア（標準化得点）',
    full: [
      '【意味】 ある生徒の得点が、グループ平均から標準偏差いくつぶん離れているかを表す数値。',
      '【目安】 Z=0：ちょうど平均／+1：上位約16%／−1：下位約16%／|Z|≥2：上位/下位 約2.5%。',
      '【教育的活用】 違うテスト同士でも難易度を補正して比較できるため、「伸び」を測るのに最適。',
    ],
  },
  classification: {
    title: '困難度 × 識別力 マップ の見方',
    full: [
      '【横軸】 困難度 p（右に行くほど易しい）',
      '【縦軸】 識別力（上に行くほど良問）',
      '🟢 緑ゾーン: 困難度 0.3〜0.85 × 識別力 0.4以上 → 良問',
      '🔴 赤: 識別力が低い問題（要改善）',
      '🟡 黄: 困難度ゾーン外（難しすぎ／易しすぎ）',
    ],
  },
  cluster: {
    title: 'クラスタ分析とは？',
    full: [
      '【意味】 似た得点パターンを持つ生徒を自動的にグループ分けする手法（K-means法）。',
      '【活用】 「数学は得意だが国語が苦手」「全体的に伸び悩み」などのタイプ別指導の設計に有効。',
      '【k の選び方】 4〜6 が一般的。「エルボー法」のグラフでカクッと折れる点を選ぶと良いです。',
      '【注意】 同じクラスタの生徒は「学習特性が似ている」だけで「同じ実力」ではありません。',
    ],
  },
  pca: {
    title: 'PCA（主成分分析）の散布図',
    full: [
      '【意味】 多次元の得点パターンを2次元に圧縮して、似た生徒同士を視覚化します。',
      '【見方】 近い位置の生徒は得点パターンが似ています。クラスタごとに塊が見えるのが理想。',
      '【寄与率】 PC1+PC2 が 50%以上なら2次元で全体像が掴めます。少なければ多次元情報が抜けています。',
    ],
  },
  association: {
    title: '連関ルール（支持度・確信度・リフト）',
    full: [
      '【支持度】 全生徒の何%が「前提＆結論」両方を満たすか（0〜1）。値が大きいほど一般的なパターン。',
      '【確信度】 前提を満たす生徒のうち、何%が結論も満たすか。',
      '【リフト】 確信度を「結論が単独で起こる確率」で割った値。1.2以上は注目に値する偶然以上の関連。',
      '【活用】 「Aが苦手な子はBも苦手」のような連鎖を見つけて、知識の前提構造を把握できます。',
    ],
  },
  reteachPriority: {
    title: '再指導優先度（独自指標）',
    full: [
      '【計算】 (1 − 全体得点率) × 識別力',
      '【意味】 全体的にできておらず、かつ「できる子はできて、できない子はできない」項目を上位に出します。',
      '【活用】 教えれば伸びる可能性が高い項目から指導することで、限られた授業時間を最大限活用できます。',
    ],
  },
  prediction: {
    title: '次回予測スコア（線形外挿）',
    full: [
      '【方法】 これまでの考査の合計点を1次関数で当てはめ、次回の試験日にあてはめた値を返します。',
      '【限界】 データ点が2〜3だと精度は限られます。生徒個別の事情（部活引退・塾通いなど）は反映されません。',
      '【活用】 予測下位の生徒に早めに声かけする「アラート」として使ってください。確定した予言ではありません。',
    ],
  },
  hiddenRisk: {
    title: '隠れリスク検出',
    full: [
      '【意味】 合計点は普通(Z>−0.3)なのに、複数の基礎項目で得点率<50%の生徒を抽出します。',
      '【活用】 表面的な合計点だけ見ると見落としがちな「基礎の取りこぼし」を持つ生徒に気づけます。',
    ],
  },
  pairLearning: {
    title: 'ペア学習推奨（補完スコア）',
    full: [
      '【計算】 ある生徒の弱み項目について、相手の得点率 − 自分の得点率 の合計。',
      '【意味】 値が大きい相手ほど「あなたが苦手な箇所が得意」=教え合いに最適。',
      '【活用】 ペア学習・少人数グループ作成の客観的指標として使えます。',
    ],
  },
  effectSize: {
    title: '効果量（Cohen\'s d）',
    full: [
      '【意味】 2群の平均差を標準偏差で割った値。差の「大きさ」を標準化した指標。',
      '【目安】 |d|≥0.2: 小さい効果／|d|≥0.5: 中程度／|d|≥0.8: 大きい効果',
      '【p値との違い】 p値は「差があるかないか」、効果量は「差の大きさ」。両方確認するのが理想。',
    ],
  },
};

/**
 * Render a predefined glossary entry by key.
 */
export function explain(key, opts = {}) {
  const e = GLOSSARY[key];
  if (!e) return null;
  return helpBox(e.title, e.full, opts);
}

/**
 * Multiple glossary entries in one box.
 */
export function explainMany(keys, opts = {}) {
  const wrap = el('div');
  for (const k of keys) {
    const node = explain(k, opts);
    if (node) wrap.appendChild(node);
  }
  return wrap;
}

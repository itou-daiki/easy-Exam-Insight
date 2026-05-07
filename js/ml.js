// Lightweight ML primitives: K-means, PCA (2D), Apriori-lite
// =========================================================================

function dist2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}
function vecMean(rows, n, d) {
  const m = new Array(d).fill(0);
  for (const r of rows) for (let i = 0; i < d; i++) m[i] += r[i];
  for (let i = 0; i < d; i++) m[i] /= n || 1;
  return m;
}

export function standardize(X) {
  const n = X.length, d = X[0].length;
  const mean = new Array(d).fill(0);
  for (const r of X) for (let i = 0; i < d; i++) mean[i] += r[i];
  for (let i = 0; i < d; i++) mean[i] /= n;
  const std = new Array(d).fill(0);
  for (const r of X) for (let i = 0; i < d; i++) std[i] += (r[i] - mean[i]) ** 2;
  for (let i = 0; i < d; i++) std[i] = Math.sqrt(std[i] / Math.max(1, n - 1)) || 1;
  return X.map(r => r.map((v, i) => (v - mean[i]) / std[i]));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function kmeansPP(X, k, seed = 42) {
  const n = X.length;
  const rng = mulberry32(seed);
  const centers = [X[Math.floor(rng() * n)].slice()];
  while (centers.length < k) {
    const dists = X.map(p => Math.min(...centers.map(c => dist2(p, c))));
    const total = dists.reduce((s, x) => s + x, 0);
    let r = rng() * total, chosen = n - 1;
    for (let i = 0; i < n; i++) { r -= dists[i]; if (r <= 0) { chosen = i; break; } }
    centers.push(X[chosen].slice());
  }
  return centers;
}

export function kmeans(X, k, opts = {}) {
  const maxIter = opts.maxIter ?? 200;
  const seed = opts.seed ?? 42;
  const n = X.length, d = X[0].length;
  let centers = kmeansPP(X, k, seed);
  let labels = new Array(n).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = dist2(X[i], centers[c]);
        if (dd < bestD) { bestD = dd; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; changed++; }
    }
    const groups = Array.from({ length: k }, () => []);
    for (let i = 0; i < n; i++) groups[labels[i]].push(X[i]);
    for (let c = 0; c < k; c++) {
      if (groups[c].length === 0) continue;
      centers[c] = vecMean(groups[c], groups[c].length, d);
    }
    if (changed === 0) break;
  }
  let inertia = 0;
  for (let i = 0; i < n; i++) inertia += dist2(X[i], centers[labels[i]]);
  return { labels, centers, inertia };
}

export function pca2(X) {
  const n = X.length, d = X[0].length;
  const mean = new Array(d).fill(0);
  for (const r of X) for (let i = 0; i < d; i++) mean[i] += r[i];
  for (let i = 0; i < d; i++) mean[i] /= n;
  const C = Array.from({ length: d }, () => new Array(d).fill(0));
  for (const r of X) {
    const c = r.map((v, i) => v - mean[i]);
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i][j] += c[i] * c[j];
  }
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i][j] /= Math.max(1, n - 1);

  function powerIter(M, iters = 200) {
    let v = Array(d).fill(0).map(() => Math.random() - 0.5);
    let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    v = v.map(x => x / norm);
    for (let it = 0; it < iters; it++) {
      const w = new Array(d).fill(0);
      for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) w[i] += M[i][j] * v[j];
      const nm = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
      v = w.map(x => x / nm);
    }
    let lam = 0;
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) lam += v[i] * M[i][j] * v[j];
    return { v, lam };
  }
  const { v: v1, lam: l1 } = powerIter(C);
  const C2 = Array.from({ length: d }, (_, i) =>
    Array.from({ length: d }, (_, j) => C[i][j] - l1 * v1[i] * v1[j]));
  const { v: v2, lam: l2 } = powerIter(C2);

  let totalVar = 0;
  for (let i = 0; i < d; i++) totalVar += C[i][i];
  const vr1 = totalVar > 0 ? l1 / totalVar : 0;
  const vr2 = totalVar > 0 ? l2 / totalVar : 0;

  const xy = X.map(r => {
    const c = r.map((v, i) => v - mean[i]);
    let p1 = 0, p2 = 0;
    for (let i = 0; i < d; i++) { p1 += c[i] * v1[i]; p2 += c[i] * v2[i]; }
    return [p1, p2];
  });
  return { xy, varRatio: [vr1, vr2] };
}

// transactions: array of Set<string>; minSupport: in [0,1]
export function apriori(transactions, minSupport, maxLen = 3) {
  const n = transactions.length;
  if (!n) return { freq: [], rules: [] };

  const counts = new Map();
  for (const t of transactions) for (const x of t) counts.set(x, (counts.get(x) || 0) + 1);
  const minCount = minSupport * n;
  const freq = new Map();
  for (const [k, c] of counts) if (c >= minCount) freq.set(JSON.stringify([k]), c);
  const allFreq = [...freq];

  let prev = [...freq.keys()].map(k => JSON.parse(k));
  for (let L = 2; L <= maxLen; L++) {
    const candidates = new Set();
    for (let i = 0; i < prev.length; i++) {
      for (let j = i + 1; j < prev.length; j++) {
        const merged = Array.from(new Set([...prev[i], ...prev[j]])).sort();
        if (merged.length === L) candidates.add(JSON.stringify(merged));
      }
    }
    const newFreq = new Map();
    for (const cKey of candidates) {
      const items = JSON.parse(cKey);
      let c = 0;
      for (const t of transactions) {
        let ok = true;
        for (const x of items) if (!t.has(x)) { ok = false; break; }
        if (ok) c++;
      }
      if (c >= minCount) {
        newFreq.set(cKey, c);
        allFreq.push([cKey, c]);
      }
    }
    if (newFreq.size === 0) break;
    prev = [...newFreq.keys()].map(k => JSON.parse(k));
  }

  const supportOf = new Map(allFreq);
  const rules = [];
  for (const [key, count] of allFreq) {
    const items = JSON.parse(key);
    if (items.length < 2) continue;
    for (let i = 0; i < items.length; i++) {
      const cons = [items[i]];
      const ant = items.filter((_, j) => j !== i).sort();
      const antKey = JSON.stringify(ant);
      const consKey = JSON.stringify(cons);
      const antCount = supportOf.get(antKey);
      const consCount = supportOf.get(consKey);
      if (!antCount || !consCount) continue;
      const support = count / n;
      const confidence = count / antCount;
      const lift = confidence / (consCount / n);
      rules.push({ ant, cons, support, confidence, lift, count });
    }
  }
  rules.sort((a, b) => b.lift - a.lift);
  return {
    freq: allFreq.map(([k, c]) => ({ items: JSON.parse(k), count: c, support: c / n })),
    rules,
  };
}

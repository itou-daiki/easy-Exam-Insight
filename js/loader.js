// Excel loader — turns school-format workbooks into normalized TestData objects
// =========================================================================

const META_COLS = ['生徒管理コード', '学年', 'クラス', '番号', 'ID', '氏名'];
const DOMAIN_COLS = ['合計点', '知', '思', '態', '技'];
const HEADER_HINT_TOKENS = ['生徒管理コード', '学年', 'クラス', '氏名', '合計点', '小計1'];

function detectHeaderRow(aoa, maxScan = 6) {
  for (let i = 0; i < Math.min(maxScan, aoa.length); i++) {
    const row = aoa[i] || [];
    const joined = row.map(v => v == null ? '' : String(v)).join(' ');
    let hits = 0;
    for (const tok of HEADER_HINT_TOKENS) if (joined.includes(tok)) hits++;
    if (hits >= 2) return i;
  }
  return 0;
}

function classifyDomain(name) {
  if (typeof name !== 'string') return null;
  const m = name.match(/[\d一-龥A-Z]学期([A-Z])/);
  if (m) return ({ R: '探究力(R)', B: '知識/活用(B)', G: '態度(G)' }[m[1]]) || m[1];
  if (name === '知' || name.includes('知識')) return '知';
  if (name === '思' || name.includes('思考')) return '思';
  return null;
}

function parseTestMeta(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  let parts = base.split('_');
  let date = null;
  if (parts.length && /^\d{12}$/.test(parts[parts.length - 1])) {
    const d = parts[parts.length - 1];
    date = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}`);
    parts = parts.slice(0, -1);
  }
  const subject = parts.length ? parts[parts.length - 1] : 'unknown';
  const labelParts = parts.length >= 4 ? parts.slice(2, -1) : parts.slice(-2, -1);
  let testId = labelParts.join('_') || base;
  if (testId) testId = subject ? `${testId}_${subject}` : testId;
  return { test_id: testId || base, subject, date };
}

function detectMaxScores(workbook, avgSheetName, itemCols) {
  if (!avgSheetName) return {};
  const ws = workbook.Sheets[avgSheetName];
  if (!ws) return {};
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i] || [];
    for (let j = 0; j < row.length; j++) {
      const v = row[j];
      if (typeof v === 'string' && v.trim() === '配点') {
        const labelRow = i + 1 < aoa.length ? aoa[i + 1] : aoa[i - 1] || [];
        // Stage 1: by-name match
        const byName = {};
        for (let k = j + 1; k < row.length; k++) {
          const lbl = labelRow[k];
          const val = row[k];
          if (typeof lbl === 'string' && typeof val === 'number' && Number.isFinite(val)) {
            byName[String(lbl).trim()] = val;
          }
        }
        const hits = {};
        for (const [k, v] of Object.entries(byName)) {
          if (itemCols.includes(k)) hits[k] = v;
        }
        if (Object.keys(hits).length) return hits;
        // Stage 2: positional fallback (last N numeric values)
        const nums = [];
        for (let k = j + 1; k < row.length; k++) {
          if (typeof row[k] === 'number' && Number.isFinite(row[k])) nums.push(row[k]);
        }
        if (nums.length >= itemCols.length) {
          const tail = nums.slice(-itemCols.length);
          const out = {};
          itemCols.forEach((c, idx) => { out[c] = tail[idx]; });
          return out;
        }
      }
    }
  }
  return {};
}

export async function loadWorkbook(file) {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array' });
  const mainSheetName = workbook.SheetNames[0];
  const avgSheetName = workbook.SheetNames.find(n => n.includes('平均') || /average/i.test(n)) || null;
  const ws = workbook.Sheets[mainSheetName];

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const headerRow = detectHeaderRow(aoa);
  const headers = (aoa[headerRow] || []).map(h => h == null ? '' : String(h).trim());
  const dataRows = aoa.slice(headerRow + 1);

  // Drop columns that have no header AND are entirely empty
  const colMask = headers.map((h, j) => {
    if (!h) {
      let nonNull = false;
      for (const r of dataRows) {
        if (r[j] != null && r[j] !== '') { nonNull = true; break; }
      }
      return nonNull;
    }
    return true;
  });
  const keptHeaders = [];
  const keptColIdx = [];
  headers.forEach((h, j) => { if (colMask[j] && h) { keptHeaders.push(h); keptColIdx.push(j); } });

  // Build records
  const records = [];
  for (const row of dataRows) {
    const rec = {};
    keptColIdx.forEach((j, k) => { rec[keptHeaders[k]] = row[j]; });
    records.push(rec);
  }
  // Drop rows with no 生徒管理コード (or 氏名 if no code col)
  const filtered = records.filter(r => {
    if ('生徒管理コード' in r) return r['生徒管理コード'] != null && r['生徒管理コード'] !== '';
    if ('氏名' in r) return r['氏名'] != null && r['氏名'] !== '';
    return true;
  });

  const metaPresent = META_COLS.filter(c => keptHeaders.includes(c));
  const domainPresent = DOMAIN_COLS.filter(c => keptHeaders.includes(c));

  const scoreCandidates = keptHeaders.filter(c => !metaPresent.includes(c) && !domainPresent.includes(c));
  const numericScoreCols = [];
  for (const c of scoreCandidates) {
    let anyNumeric = false;
    for (const r of filtered) {
      const v = r[c];
      if (v == null || v === '') { r[c] = NaN; continue; }
      const n = typeof v === 'number' ? v : parseFloat(v);
      r[c] = Number.isFinite(n) ? n : NaN;
      if (Number.isFinite(n)) anyNumeric = true;
    }
    if (anyNumeric) numericScoreCols.push(c);
  }

  for (const c of domainPresent) {
    for (const r of filtered) {
      const v = r[c];
      if (v == null || v === '') { r[c] = NaN; continue; }
      const n = typeof v === 'number' ? v : parseFloat(v);
      r[c] = Number.isFinite(n) ? n : NaN;
    }
  }
  for (const c of ['学年', 'クラス', '番号', 'ID']) {
    if (!keptHeaders.includes(c)) continue;
    for (const r of filtered) {
      const v = r[c];
      if (v == null || v === '') continue;
      const n = typeof v === 'number' ? v : parseFloat(v);
      if (Number.isFinite(n)) r[c] = n;
    }
  }

  const maxScores = detectMaxScores(workbook, avgSheetName, numericScoreCols);
  const items = numericScoreCols.map(name => ({
    name,
    max_score: maxScores[name] != null ? maxScores[name] : null,
    domain: classifyDomain(name),
  }));

  let allDomain = domainPresent.slice();
  if (!allDomain.includes('合計点') && numericScoreCols.length) {
    for (const r of filtered) {
      let s = 0, ok = true;
      for (const c of numericScoreCols) {
        if (!Number.isFinite(r[c])) { ok = false; break; }
        s += r[c];
      }
      r['合計点'] = ok ? s : NaN;
    }
    allDomain = ['合計点', ...allDomain];
  }

  const meta = parseTestMeta(file.name);
  let grade = null;
  if (keptHeaders.includes('学年')) {
    const counts = new Map();
    for (const r of filtered) if (Number.isFinite(r['学年'])) counts.set(r['学年'], (counts.get(r['学年']) || 0) + 1);
    let bestK = null, bestN = 0;
    for (const [k, n] of counts) if (n > bestN) { bestK = k; bestN = n; }
    grade = bestK;
  }

  return {
    test_id: meta.test_id,
    test_date: meta.date,
    subject: meta.subject,
    grade,
    rows: filtered,
    items,
    domain_cols: allDomain,
    meta_cols: metaPresent,
    source_filename: file.name,
  };
}

// ---------- Helpers ----------
export function valuesOf(td, col) { return td.rows.map(r => r[col]); }

export function ratiosForItem(td, it) {
  let denom = it.max_score;
  if (!denom) {
    let m = 0;
    for (const r of td.rows) if (Number.isFinite(r[it.name]) && r[it.name] > m) m = r[it.name];
    denom = m || 1;
  }
  return td.rows.map(r => Number.isFinite(r[it.name]) ? r[it.name] / denom : NaN);
}

export function fmtTestLabel(td) {
  const d = td.test_date ? td.test_date.toISOString().slice(0, 10) : '—';
  return `${td.test_id} (${d}, n=${td.rows.length})`;
}

export function ratioMatrix(td) {
  // rows × items, normalized (0–1). Uses ratiosForItem per item.
  const cols = td.items.map(it => ratiosForItem(td, it));
  const out = [];
  for (let i = 0; i < td.rows.length; i++) {
    const row = [];
    for (let j = 0; j < td.items.length; j++) row.push(cols[j][i]);
    out.push(row);
  }
  return out;
}

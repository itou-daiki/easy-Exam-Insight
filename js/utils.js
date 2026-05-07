// Shared UI + math helpers
// =========================================================================

export function el(tag, props, ...children) {
  const e = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (k === 'class' || k === 'className') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (v != null) e.setAttribute(k, v);
  });
  for (const c of children.flat()) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function toast(message, kind = 'info', timeout = 3500) {
  const t = el('div', {
    class: `callout ${kind}`,
    style: { position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999, maxWidth: '320px', boxShadow: '0 8px 24px rgba(0,0,0,.15)' }
  }, message);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), timeout);
}

// ---------- Tables ----------
// opts.rowKey: function(row, idx) -> string | null. If returns a non-empty
// string and the string starts with a 生徒管理コード prefix, the row becomes
// clickable and navigates to the per-student feedback page.
export function renderTable(headers, rows, opts = {}) {
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 't-table' });
  const thead = el('thead');
  const trh = el('tr');
  for (const h of headers) {
    const label = typeof h === 'object' ? h.label : h;
    const th = el('th', { class: typeof h === 'object' && h.num ? 'num' : '' }, label);
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = el('tbody');
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const tr = el('tr');
    // Auto-detect 生徒管理コード in the first cell (pattern: starts with letters and contains digits)
    let studentCode = null;
    if (opts.rowKey) {
      try { studentCode = opts.rowKey(row, rIdx); } catch (e) { studentCode = null; }
    } else if (row.length && typeof row[0] === 'string' && /^[a-z]+\d+$/i.test(row[0])) {
      studentCode = row[0];
    }
    if (studentCode) {
      tr.dataset.studentCode = studentCode;
      tr.style.cursor = 'pointer';
      tr.title = 'クリックで個人カルテを開く';
      tr.addEventListener('click', () => {
        if (typeof window.jumpToStudent === 'function') window.jumpToStudent(studentCode);
      });
    }
    for (const cell of row) {
      let v = cell, cls = '';
      if (cell && typeof cell === 'object') { v = cell.v; cls = cell.cls || ''; }
      const td = el('td', { class: cls });
      if (typeof v === 'number' && Number.isFinite(v)) {
        td.classList.add('num');
        td.textContent = opts.fmt ? opts.fmt(v) : (Number.isInteger(v) ? String(v) : v.toFixed(3));
      } else if (typeof v === 'number') {
        // NaN / Infinity → em dash
        td.classList.add('num');
        td.textContent = '—';
      } else {
        td.textContent = v == null ? '—' : String(v);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

export function downloadCSV(filename, headers, rows) {
  const escape = v => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(h => escape(typeof h === 'object' ? h.label : h)).join(',')];
  for (const r of rows) lines.push(r.map(c => escape(c && typeof c === 'object' ? c.v : c)).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadXLSX(filename, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, s] of Object.entries(sheets)) {
    const aoa = [
      s.headers.map(h => typeof h === 'object' ? h.label : h),
      ...s.rows.map(r => r.map(c => c && typeof c === 'object' ? c.v : c)),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 30));
  }
  XLSX.writeFile(wb, filename);
}

// ---------- KPI ----------
export function kpi(label, value, sub) {
  return el('div', { class: 'kpi' },
    el('div', { class: 'label' }, label),
    el('div', { class: 'value' }, String(value)),
    sub ? el('div', { class: 'sub' }, sub) : null
  );
}

// ---------- Plot ----------
let _plotSeq = 0;
export function plotEl(traces, layout = {}, config = {}) {
  const id = `plot-${++_plotSeq}-${Date.now()}`;
  const div = el('div', { id, class: 'plot' });
  queueMicrotask(() => {
    const tryRender = () => {
      if (typeof Plotly === 'undefined') {
        setTimeout(tryRender, 50);
        return;
      }
      Plotly.newPlot(id, traces, layout, { responsive: true, displaylogo: false, ...config });
    };
    if (!document.body.contains(div)) {
      const obs = new MutationObserver(() => {
        if (document.body.contains(div)) {
          obs.disconnect();
          tryRender();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    } else {
      tryRender();
    }
  });
  return div;
}

// ---------- Tabs ----------
export function makeTabs(items) {
  const wrap = el('div');
  const bar = el('div', { class: 'tabs' });
  const panes = el('div');
  const buttons = [];
  const paneEls = [];
  items.forEach((it, i) => {
    const btn = el('button', { class: 'tab-btn' + (i === 0 ? ' active' : ''), type: 'button' }, it.label);
    const pane = el('div', { class: 'tab-pane' + (i === 0 ? ' active' : '') });
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      paneEls.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      pane.classList.add('active');
      if (!pane.dataset.rendered) {
        const node = it.render();
        if (node) pane.appendChild(node);
        pane.dataset.rendered = '1';
      }
    });
    if (i === 0) {
      const node = it.render();
      if (node) pane.appendChild(node);
      pane.dataset.rendered = '1';
    }
    buttons.push(btn);
    paneEls.push(pane);
    bar.appendChild(btn);
    panes.appendChild(pane);
  });
  wrap.appendChild(bar);
  wrap.appendChild(panes);
  return wrap;
}

// ---------- Stats ----------
export function mean(a) {
  const v = a.filter(Number.isFinite);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
}
export function median(a) {
  const v = a.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function stdev(a, sample = true) {
  const v = a.filter(Number.isFinite);
  if (v.length < 2) return 0;
  const m = mean(v);
  const s = v.reduce((s, x) => s + (x - m) ** 2, 0) / (sample ? v.length - 1 : v.length);
  return Math.sqrt(s);
}
export function variance(a, sample = true) {
  const v = a.filter(Number.isFinite);
  if (v.length < 2) return 0;
  const m = mean(v);
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / (sample ? v.length - 1 : v.length);
}
export function corr(x, y) {
  const n = Math.min(x.length, y.length);
  let sx = 0, sy = 0, n2 = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(x[i]) && Number.isFinite(y[i])) { sx += x[i]; sy += y[i]; n2++; }
  if (n2 < 3) return NaN;
  const mx = sx / n2, my = sy / n2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return NaN;
  return num / Math.sqrt(dx * dy);
}
export function quantile(a, q) {
  const v = a.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!v.length) return NaN;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos), frac = pos - lo;
  return v[lo] + (v[hi] - v[lo]) * frac;
}
export function zScores(arr) {
  const m = mean(arr), s = stdev(arr) || 1;
  return arr.map(v => (Number.isFinite(v) ? (v - m) / s : NaN));
}
export function cronbachAlpha(matrix) {
  const rows = matrix.filter(r => r.every(Number.isFinite));
  if (rows.length < 2 || rows[0].length < 2) return NaN;
  const k = rows[0].length;
  const itemVars = [];
  for (let j = 0; j < k; j++) itemVars.push(variance(rows.map(r => r[j])));
  const totVar = variance(rows.map(r => r.reduce((s, x) => s + x, 0)));
  if (totVar === 0) return NaN;
  return (k / (k - 1)) * (1 - itemVars.reduce((s, x) => s + x, 0) / totVar);
}

// ---------- Format ----------
export function fmtPct(v) { return Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—'; }
export function fmtNum(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

// ---------- Anonymize ----------
// Returns the displayable name. If anonymize mode is on, returns 生徒A/B/...
// idx: stable index (e.g. row index in the dataset). Use 生徒管理コード as
// fallback to keep mapping stable across re-renders.
export function displayName(originalName, idx, fallbackKey) {
  const anon = !!(window._appState && window._appState.anonymize);
  if (!anon) return originalName || '—';
  // Stable mapping: if fallbackKey present, hash it to a small int
  let n = idx;
  if (n == null && fallbackKey) {
    let h = 0;
    const s = String(fallbackKey);
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    n = Math.abs(h);
  }
  if (n == null) return '生徒';
  const i = parseInt(n, 10);
  if (i < 26) return `生徒${String.fromCharCode(65 + i)}`;
  if (i < 26 * 27) return `生徒${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`;
  return `生徒${i}`;
}

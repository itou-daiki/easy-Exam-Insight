// Shared "test picker" widget for analysis modules
// =========================================================================
import { el } from './utils.js';

export function singlePicker(state, onChange) {
  const wrap = el('div', { class: 'form-row' });
  const sel = el('select');
  state.tests.forEach((t, i) => {
    sel.appendChild(el('option', { value: i }, t.test_id));
  });
  sel.addEventListener('change', () => onChange(state.tests[parseInt(sel.value, 10)]));
  wrap.appendChild(el('label', null, '対象の考査', sel));
  queueMicrotask(() => onChange(state.tests[parseInt(sel.value, 10)]));
  return wrap;
}

export function multiPicker(state, onChange) {
  const wrap = el('div', { class: 'form-row' });
  const sel = el('select', {
    multiple: true,
    size: Math.min(6, Math.max(2, state.tests.length)),
    style: { minWidth: '320px' },
  });
  state.tests.forEach((t, i) => {
    sel.appendChild(el('option', { value: i, selected: 'selected' }, t.test_id));
  });
  const trigger = () => {
    const idxs = Array.from(sel.selectedOptions).map(o => parseInt(o.value, 10));
    onChange(idxs.map(i => state.tests[i]));
  };
  sel.addEventListener('change', trigger);
  wrap.appendChild(el('label', null, '対象の考査（複数選択可）', sel));
  queueMicrotask(trigger);
  return wrap;
}

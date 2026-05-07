// Test Analyzer — entry point
// =========================================================================

import { loadWorkbook } from './loader.js?v=3';
import { el, clear, toast } from './utils.js?v=3';

export const state = { tests: [] };
window._appState = state;

const $ = id => document.getElementById(id);
const fileInput = $('file-input');
const uploadBtn = $('upload-btn');
const uploadArea = $('upload-area');
const clearBtn = $('clear-btn');
const loadedTests = $('loaded-tests');
const featureCards = document.querySelectorAll('.feature-card');
const analysisSection = $('analysis-section');
const analysisContent = $('analysis-content');
const analysisTitle = $('analysis-title');
const backBtn = $('back-btn');
const featureSection = $('feature-section');
const uploadSection = $('upload-section');

uploadBtn.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('click', e => {
  if (e.target.tagName !== 'BUTTON') fileInput.click();
});
fileInput.addEventListener('change', e => handleFiles(e.target.files));

uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});

clearBtn.addEventListener('click', () => {
  if (state.tests.length === 0) return;
  if (!confirm('読み込み済みデータを全消去しますか？')) return;
  state.tests = [];
  renderLoadedTests();
  updateFeatureCards();
  toast('全消去しました', 'success');
});

async function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => /\.xlsx?$/i.test(f.name));
  if (!files.length) { toast('Excelファイル(.xlsx)を選択してください', 'warn'); return; }
  const orig = uploadArea.querySelector('.upload-text').textContent;
  uploadArea.querySelector('.upload-text').innerHTML = '<i class="fas fa-spinner fa-spin"></i> 読み込み中…';
  let ok = 0;
  for (const f of files) {
    try {
      const td = await loadWorkbook(f);
      const idx = state.tests.findIndex(t => t.test_id === td.test_id);
      if (idx >= 0) state.tests.splice(idx, 1, td);
      else state.tests.push(td);
      ok++;
    } catch (e) {
      console.error('load failed', f.name, e);
      toast(`❌ ${f.name}: ${e.message}`, 'danger', 5500);
    }
  }
  uploadArea.querySelector('.upload-text').textContent = orig;
  fileInput.value = '';
  renderLoadedTests();
  updateFeatureCards();
  if (ok) toast(`${ok}件 読み込みました`, 'success');
}

function renderLoadedTests() {
  clear(loadedTests);
  if (state.tests.length === 0) return;
  const sorted = state.tests.slice().sort((a, b) => {
    const da = a.test_date ? a.test_date.getTime() : Infinity;
    const db = b.test_date ? b.test_date.getTime() : Infinity;
    return da - db;
  });
  for (const td of sorted) {
    const date = td.test_date ? td.test_date.toISOString().slice(0, 10) : '—';
    const pill = el('div', { class: 'test-pill' },
      el('div', { class: 'pill-title' }, td.test_id),
      el('div', { class: 'pill-meta' },
        `📅 ${date} | 学年${td.grade ?? '?'} | n=${td.rows.length} | 小問${td.items.length}`),
      el('button', {
        class: 'pill-remove', title: '削除',
        onclick: () => {
          state.tests = state.tests.filter(t => t.test_id !== td.test_id);
          renderLoadedTests();
          updateFeatureCards();
        },
      }, '×')
    );
    loadedTests.appendChild(pill);
  }
}

function updateFeatureCards() {
  for (const card of featureCards) {
    const req = parseInt(card.dataset.requires || '1', 10);
    const ok = state.tests.length >= req;
    card.classList.toggle('disabled', !ok);
    if (ok) card.onclick = () => showAnalysis(card.dataset.analysis);
    else card.onclick = null;
  }
}

const ANALYSIS_TITLES = {
  overview: '🔍 概要・EDA',
  item_analysis: '📐 項目分析（古典的テスト理論）',
  clustering: '🧬 クラスタ分析（生徒タイプの発見）',
  student_feedback: '👤 生徒別フィードバック',
  association: '🕸️ 連関分析',
  teacher_dashboard: '🎓 教員ダッシュボード',
  longitudinal: '📈 縦断比較',
};

async function showAnalysis(type) {
  analysisTitle.textContent = ANALYSIS_TITLES[type] || type;
  analysisSection.classList.remove('hidden');
  uploadSection.style.display = 'none';
  featureSection.style.display = 'none';
  clear(analysisContent);
  analysisContent.appendChild(
    el('div', { class: 'callout info' },
      el('i', { class: 'fas fa-spinner fa-spin' }),
      ' 分析モジュールを読み込み中…')
  );
  try {
    const mod = await import(`./analyses/${type}.js?v=3`);
    clear(analysisContent);
    mod.render(analysisContent, state);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    console.error(e);
    clear(analysisContent);
    analysisContent.appendChild(el('div', { class: 'callout danger' },
      `分析モジュールの読み込みに失敗しました (${type}.js)`,
      el('br'),
      el('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '0.8rem' } }, String(e.stack || e))
    ));
  }
}

backBtn.addEventListener('click', () => {
  analysisSection.classList.add('hidden');
  uploadSection.style.display = '';
  featureSection.style.display = '';
  clear(analysisContent);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

renderLoadedTests();
updateFeatureCards();

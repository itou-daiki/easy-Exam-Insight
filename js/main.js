// Test Analyzer — entry point
// =========================================================================

import { loadWorkbook, saveTestsToStorage, loadTestsFromStorage, clearStorage } from './loader.js?v=5';
import { el, clear, toast } from './utils.js?v=5';

export const state = {
  tests: [],
  anonymize: localStorage.getItem('testAnalyzer.anonymize') === '1',
  darkMode: localStorage.getItem('testAnalyzer.darkMode') === '1',
};
window._appState = state;

// Apply dark mode immediately
if (state.darkMode) document.documentElement.classList.add('dark');

// Hydrate from previous session
state.tests = loadTestsFromStorage();

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
  if (!confirm('読み込み済みデータを全消去しますか？\n（ブラウザ保存も含めて消去します）')) return;
  state.tests = [];
  clearStorage();
  renderLoadedTests();
  updateFeatureCards();
  toast('全消去しました', 'success');
});

// =========================================================================
// Anonymize helper (used by every analysis via window._appState.anonymize)
// =========================================================================
window.anonymizeName = function(originalName, idx) {
  if (!state.anonymize) return originalName;
  if (idx == null) return '生徒';
  const i = parseInt(idx, 10);
  if (i < 26) return `生徒${String.fromCharCode(65 + i)}`;
  return `生徒${i + 1}`;
};

// =========================================================================
// Toolbar (anonymize, dark, demo, manual)
// =========================================================================
function buildToolbar() {
  const bar = el('div', { class: 'toolbar' });
  // Anonymize
  const anonBtn = el('button', {
    class: 'btn small ghost' + (state.anonymize ? ' active' : ''),
    onclick: () => {
      state.anonymize = !state.anonymize;
      localStorage.setItem('testAnalyzer.anonymize', state.anonymize ? '1' : '0');
      anonBtn.classList.toggle('active', state.anonymize);
      anonBtn.innerHTML = state.anonymize
        ? '<i class="fas fa-mask"></i> 匿名化ON'
        : '<i class="fas fa-mask"></i> 匿名化OFF';
      toast(state.anonymize ? '匿名化モードON（生徒A〜Z表示）' : '匿名化モードOFF', 'info');
      // re-render current page if it's an analysis
      if (!analysisSection.classList.contains('hidden')) {
        const t = analysisTitle.textContent;
        for (const k of Object.keys(ANALYSIS_TITLES)) {
          if (ANALYSIS_TITLES[k] === t) { showAnalysis(k); break; }
        }
      }
    },
  }, state.anonymize ? '匿名化ON' : '匿名化OFF');
  anonBtn.innerHTML = `<i class="fas fa-mask"></i> ${state.anonymize ? '匿名化ON' : '匿名化OFF'}`;

  // Dark mode
  const darkBtn = el('button', {
    class: 'btn small ghost',
    onclick: () => {
      state.darkMode = !state.darkMode;
      localStorage.setItem('testAnalyzer.darkMode', state.darkMode ? '1' : '0');
      document.documentElement.classList.toggle('dark', state.darkMode);
      darkBtn.innerHTML = state.darkMode
        ? '<i class="fas fa-sun"></i> ライト'
        : '<i class="fas fa-moon"></i> ダーク';
    },
  });
  darkBtn.innerHTML = state.darkMode
    ? '<i class="fas fa-sun"></i> ライト'
    : '<i class="fas fa-moon"></i> ダーク';

  // Demo data
  const demoBtn = el('button', {
    class: 'btn small ghost',
    onclick: () => loadDemoData(),
  });
  demoBtn.innerHTML = '<i class="fas fa-flask"></i> デモデータ';

  // Manual link
  const manualBtn = el('a', {
    class: 'btn small ghost',
    href: 'manual.html',
    target: '_blank',
  });
  manualBtn.innerHTML = '<i class="fas fa-book"></i> マニュアル';

  bar.appendChild(anonBtn);
  bar.appendChild(darkBtn);
  bar.appendChild(demoBtn);
  bar.appendChild(manualBtn);
  return bar;
}
const toolbarMount = document.querySelector('.hero-section');
if (toolbarMount) toolbarMount.appendChild(buildToolbar());

// =========================================================================
// Demo data — synthesize a small sample test
// =========================================================================
function loadDemoData() {
  const demo = makeDemoTest('demo_1学期期末_数学Ⅰ', 35, '2026-04-30');
  const demo2 = makeDemoTest('demo_2学期期末_数学Ⅰ', 35, '2026-09-30');
  const demo3 = makeDemoTest('demo_3学期期末_数学Ⅰ', 35, '2027-02-28');
  const idx = (id) => state.tests.findIndex(t => t.test_id === id);
  for (const td of [demo, demo2, demo3]) {
    const i = idx(td.test_id);
    if (i >= 0) state.tests.splice(i, 1, td);
    else state.tests.push(td);
  }
  saveTestsToStorage(state.tests);
  renderLoadedTests();
  updateFeatureCards();
  toast('デモデータを読み込みました（3考査・35名）', 'success');
}

function makeDemoTest(testId, n, dateStr) {
  const items = [
    { name: '小計1', max_score: 20, domain: '知', unit_name: '数と式' },
    { name: '小計2', max_score: 20, domain: '知', unit_name: '二次関数' },
    { name: '小計3', max_score: 15, domain: '思', unit_name: '図形と計量' },
    { name: '小計4', max_score: 20, domain: '思', unit_name: 'データの分析' },
    { name: '小計5', max_score: 25, domain: '思', unit_name: '応用問題' },
  ];
  const rows = [];
  let seed = testId.length;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const familyNames = ['佐藤','鈴木','高橋','田中','伊藤','渡辺','山本','中村','小林','加藤'];
  const givenNames = ['太郎','花子','次郎','三郎','美咲','大輔','直樹','里奈','翔太','美穂','拓海','彩'];
  for (let i = 0; i < n; i++) {
    const ability = rand() * 0.6 + 0.2; // 0.2〜0.8
    const code = `demo${String(i + 1).padStart(4, '0')}`;
    const fam = familyNames[i % familyNames.length];
    const giv = givenNames[(i * 7) % givenNames.length];
    const cls = ((i % 3) + 1);
    const sub = items.map(it => {
      const noise = (rand() - 0.5) * 0.3;
      const ratio = Math.max(0, Math.min(1, ability + noise));
      return Math.round(it.max_score * ratio);
    });
    const total = sub.reduce((s, x) => s + x, 0);
    const knowledge = sub[0] + sub[1];
    const thinking = sub[2] + sub[3] + sub[4];
    rows.push({
      '生徒管理コード': code,
      '学年': 1, 'クラス': cls, '番号': i + 1,
      '氏名': `${fam}${giv}`,
      '合計点': total, '知': knowledge, '思': thinking,
      '小計1': sub[0], '小計2': sub[1], '小計3': sub[2], '小計4': sub[3], '小計5': sub[4],
    });
  }
  return {
    test_id: testId,
    test_date: new Date(dateStr),
    subject: '数学Ⅰ',
    grade: 1,
    rows,
    items,
    domain_cols: ['合計点', '知', '思'],
    domain_max_scores: { '合計点': 100, '知': 40, '思': 60 },
    meta_cols: ['生徒管理コード', '学年', 'クラス', '番号', '氏名'],
    source_filename: 'demo.xlsx',
  };
}

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
  if (ok) {
    saveTestsToStorage(state.tests);
    toast(`${ok}件 読み込みました（ブラウザに自動保存）`, 'success');
  }
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
          saveTestsToStorage(state.tests);
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
  summary: '📋 サマリー（全分析のダイジェスト）',
  data_quality: '🔍 データ品質チェック',
  overview: '🔍 概要・EDA',
  item_analysis: '📐 項目分析（古典的テスト理論）',
  clustering: '🧬 クラスタ分析（生徒タイプの発見）',
  student_feedback: '👤 生徒別フィードバック',
  association: '🕸️ 連関分析',
  teacher_dashboard: '🎓 教員ダッシュボード',
  longitudinal: '📈 縦断比較',
  rankings: '🏆 ランキング（TOP/WORST 20）',
  rubric: '🎓 観点別評定マトリックス',
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
    const mod = await import(`./analyses/${type}.js?v=5`);
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

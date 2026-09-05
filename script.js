/* ==========================================================
   설정
   ========================================================== */

// Google Sheets에 응답을 저장하고 싶다면, Google Apps Script로 만든
// 웹 앱 URL을 아래에 붙여넣으세요. 비워두면(기본값) 저장은 브라우저 안
// localStorage에만 되고, 데모로만 동작합니다.
//
// 연결 방법 요약(선택 사항):
// 1) Google Sheets에서 새 스프레드시트를 만들고
//    첫 행에 다음 7개 컬럼명을 순서대로 넣습니다.
//    user_id, timestamp, situation_input, complaint_category,
//    concept_interest_score, concept_interest_reason, existing_product_experience
// 2) 확장 프로그램 > Apps Script 에서 doPost(e) 함수를 만들어
//    e.postData.contents를 JSON.parse 한 뒤 시트에 한 행으로 추가하고,
//    "배포 > 웹 앱"으로 배포한 URL을 아래 SHEETS_WEB_APP_URL에 넣습니다.
// 3) 이 URL을 넣는 순간부터는 실제로 외부 서버(Google)에 데이터가
//    전송된다는 점을 스스로 인지하고 있어야 합니다.
const SHEETS_WEB_APP_URL = ''; // 예: 'https://script.google.com/macros/s/xxxx/exec'

/* ==========================================================
   상태
   ========================================================== */

const state = {
  hasExperience: null,   // 'yes' | 'no'
  stopReason: null,      // 'taste' | 'price' | 'access' | 'etc' | null
  situation: null,       // '반찬' | '볶음' | '비빔' | '기타'
  freeText: '',
  category: null,        // 'taste' | 'price' | 'access' | 'etc'
  interestScore: null,   // '1'~'5'
  interestReason: ''
};

function generateUserId() {
  return 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const userId = generateUserId();

/* ==========================================================
   화면 전환
   ========================================================== */

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.classList.toggle('screen--active', el.dataset.screen === name);
  });
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

document.querySelectorAll('[data-action="go-input"]').forEach((btn) => {
  btn.addEventListener('click', () => showScreen('input'));
});

document.querySelectorAll('[data-action="restart"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('situation-form').reset();
    document.getElementById('response-form').reset();
    document.getElementById('reason-field').hidden = true;
    document.getElementById('complete-card').hidden = true;
    document.getElementById('response-form').style.display = '';
    showScreen('landing');
  });
});

/* ==========================================================
   화면 2: 상황 입력 폼
   ========================================================== */

const situationForm = document.getElementById('situation-form');
const reasonField = document.getElementById('reason-field');
const reasonSelect = document.getElementById('reasonSelect');
const formError = document.getElementById('form-error');

situationForm.addEventListener('change', (e) => {
  if (e.target.name === 'hasExperience') {
    const show = e.target.value === 'yes';
    reasonField.hidden = !show;
    reasonSelect.required = show;
    if (!show) reasonSelect.value = '';
  }
});

situationForm.addEventListener('submit', (e) => {
  e.preventDefault();
  formError.hidden = true;

  const hasExperienceEl = situationForm.querySelector('input[name="hasExperience"]:checked');
  const situationEl = situationForm.querySelector('input[name="situation"]:checked');
  const consentEl = document.getElementById('consentCheck');
  const freeTextEl = document.getElementById('freeText');

  if (!hasExperienceEl || !situationEl) {
    formError.textContent = '필수 항목을 모두 선택해주세요.';
    formError.hidden = false;
    return;
  }
  if (hasExperienceEl.value === 'yes' && !reasonSelect.value) {
    formError.textContent = '계속 쓰지 않게 된 이유를 선택해주세요.';
    formError.hidden = false;
    return;
  }
  if (!consentEl.checked) {
    formError.textContent = '다음 단계로 진행하려면 안내 사항에 동의해주세요.';
    formError.hidden = false;
    return;
  }

  state.hasExperience = hasExperienceEl.value;
  state.stopReason = hasExperienceEl.value === 'yes' ? reasonSelect.value : null;
  state.situation = situationEl.value;
  state.freeText = freeTextEl.value.trim();

  runClassification();
  showScreen('summary');
});

/* ==========================================================
   규칙 기반 분류 (데모용 · 실제 AI 아님)
   ========================================================== */

const CATEGORY_LABEL = {
  taste: '맛 불만',
  price: '가격 부담',
  access: '구하기 어려움',
  etc: '기타'
};

const KEYWORD_RULES = [
  { category: 'taste', words: ['맛없', '밋밋', '싱겁', '별로', '맛이 없', '심심'] },
  { category: 'price', words: ['비싸', '가격', '비용', '부담'] },
  { category: 'access', words: ['구하기', '찾기 어려', '없어서', '안 팔', '품절', '살 곳'] }
];

function classifyText(text) {
  const lower = text.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.words.some((w) => lower.includes(w))) return rule.category;
  }
  return null;
}

function runClassification() {
  // 우선순위: 선택형 stopReason > 자유서술 텍스트 키워드 매칭 > 기타
  let category = state.stopReason;
  if (!category && state.freeText) {
    category = classifyText(state.freeText);
  }
  if (!category) category = 'etc';

  state.category = category;

  const categoryEl = document.getElementById('categoryResult');
  const summaryEl = document.getElementById('summaryResult');

  categoryEl.textContent = CATEGORY_LABEL[category];

  const situationText = state.situation ? `${state.situation} 상황에서, ` : '';
  const freeTextPreview = state.freeText
    ? `직접 남기신 내용: "${state.freeText.slice(0, 80)}${state.freeText.length > 80 ? '…' : ''}"`
    : '선택하신 항목을 기준으로 분류했습니다.';

  summaryEl.textContent = `${situationText}${freeTextPreview}`;
}

/* ==========================================================
   화면 3 → 4 이동
   ========================================================== */

document.querySelectorAll('[data-action="go-response"]').forEach((btn) => {
  btn.addEventListener('click', () => showScreen('response'));
});

/* ==========================================================
   화면 4: 컨셉 반응 폼
   ========================================================== */

const responseForm = document.getElementById('response-form');
const responseError = document.getElementById('response-error');

responseForm.addEventListener('submit', (e) => {
  e.preventDefault();
  responseError.hidden = true;

  const interestEl = responseForm.querySelector('input[name="interest"]:checked');
  const reasonTextEl = document.getElementById('reasonText');

  if (!interestEl) {
    responseError.textContent = '관심도를 선택해주세요.';
    responseError.hidden = false;
    return;
  }
  if (!reasonTextEl.value.trim()) {
    responseError.textContent = '이유를 간단히 적어주세요.';
    responseError.hidden = false;
    return;
  }

  state.interestScore = interestEl.value;
  state.interestReason = reasonTextEl.value.trim();

  saveResponse();

  responseForm.style.display = 'none';
  document.getElementById('complete-card').hidden = false;
});

/* ==========================================================
   응답 저장 (localStorage 기본, Sheets는 URL 설정 시에만)
   ========================================================== */

function buildRecord() {
  const situationInputCombined = [
    state.situation ? `상황: ${state.situation}` : '',
    state.freeText ? `자유서술: ${state.freeText}` : ''
  ].filter(Boolean).join(' / ');

  const existingProductExperience = state.hasExperience === 'yes'
    ? `있음 (${CATEGORY_LABEL[state.stopReason] || '이유 미상'})`
    : '없음';

  return {
    user_id: userId,
    timestamp: new Date().toISOString(),
    situation_input: situationInputCombined,
    complaint_category: state.category,
    concept_interest_score: state.interestScore,
    concept_interest_reason: state.interestReason,
    existing_product_experience: existingProductExperience
  };
}

function saveResponse() {
  const record = buildRecord();

  // 1) 기본: 브라우저 localStorage에 데모로 누적 저장
  try {
    const key = 'lowsodium_mvp_responses';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push(record);
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (err) {
    console.warn('localStorage 저장 실패:', err);
  }

  // 2) 선택: SHEETS_WEB_APP_URL이 설정된 경우에만 Google Sheets로 전송
  if (SHEETS_WEB_APP_URL) {
    fetch(SHEETS_WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors', // Apps Script 웹앱은 보통 no-cors로 전송
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    }).catch((err) => {
      console.warn('Google Sheets 전송 실패(무시하고 진행):', err);
    });
  }

  console.log('[데모] 저장된 응답:', record);
}

(() => {
  // i18n system
  let currentLang = 'fr';
  let resources = {};
  
  function detectLanguage() {
    const saved = localStorage.getItem('multiplication_lang');
    if (saved) return saved;
    const browser = navigator.language || navigator.userLanguage;
    return browser.startsWith('fr') ? 'fr' : 'en';
  }
  
  async function loadLanguage(lang) {
    try {
      const res = await fetch(`locale/${lang}.json`);
      if (!res.ok) throw new Error('Failed to load language');
      resources = await res.json();
      currentLang = lang;
      localStorage.setItem('multiplication_lang', lang);
      applyTranslations();
    } catch (e) {
      console.warn('Failed to load language', lang, e);
    }
  }
  
  function t(key) {
    const parts = key.split('.');
    let obj = resources;
    for (const p of parts) {
      if (!obj || typeof obj[p] === 'undefined') return key;
      obj = obj[p];
    }
    return obj;
  }
  
  function applyTranslations() {
    // Title and meta
    const titleEl = document.querySelector('title');
    if (titleEl) titleEl.textContent = t('app.title');
    const metaEl = document.querySelector('meta[name="description"]');
    if (metaEl) metaEl.setAttribute('content', t('app.description'));
    
    // Elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    
    // Elements with data-i18n-content (for meta content)
    document.querySelectorAll('[data-i18n-content]').forEach(el => {
      el.setAttribute('content', t(el.getAttribute('data-i18n-content')));
    });
    
    // Re-render treasure cards to update card labels immediately
    renderTreasure();
  }
  
  // Initialize i18n
  const $ = id => document.getElementById(id);
  const tablesEl = $('tables');
  const startBtn = $('startBtn');
  const gameEl = $('game');
  const setupEl = $('setup');
  const resultEl = $('result');
  const timerEl = $('timer');
  const progressEl = $('progress');
  const problemEl = $('problem');
  const answerDisplay = $('answerDisplay');
  const keypadEl = $('keypad');
  const trackEl = $('progressTrack');
  const resultTitle = $('resultTitle');
  const resultDetails = $('resultDetails');
  const retryBtn = $('retryBtn');
  const backSetupBtn = $('backSetupBtn');
  const cardsEl = $('cards');
  const resetCardsBtn = $('resetCardsBtn');
  const animEl = $('animation');
  const animContent = $('animationContent');
  const resetModal = $('resetModal');
  const confirmResetBtn = $('confirmResetBtn');
  const cancelResetBtn = $('cancelResetBtn');
  const languageBtn = $('languageBtn');
  const languageModal = $('languageModal');
  const closeLanguageModalBtn = $('closeLanguageModalBtn');

  // Global variables
  const NUM_PROBLEMS = 20
  const TIME_LIMIT = 60
  
  let selectedTables = new Set();
  let problems = [];
  let current = 0;
  let startTime = 0;
  let timerId = null;
  let inputBuffer = '';
  // cartes collectionnables (emoji). Noms dynamiques selon langue.
  const CARDS = [
    {id:'c1',emoji:'🌟',color:'#f59e0b'},
    {id:'c2',emoji:'🚀',color:'#06b6d4'},
    {id:'c3',emoji:'🧰',color:'#ef4444'},
    {id:'c4',emoji:'🏅',color:'#10b981'},
    {id:'c5',emoji:'👑',color:'#f97316'},
    {id:'c6',emoji:'🦄',color:'#8b5cf6'},
    {id:'c7',emoji:'💎',color:'#3b82f6'},
    {id:'c8',emoji:'🪐',color:'#06b6d4'},
    {id:'c9',emoji:'🌈',color:'#22c55e'},
    {id:'c10',emoji:'⚡',color:'#f59e0b'},
    {id:'c11',emoji:'❤️',color:'#ef4444'},
    {id:'c12',emoji:'📚',color:'#3b82f6'},
    {id:'c13',emoji:'🧪',color:'#a78bfa'},
    {id:'c14',emoji:'🐿️',color:'#a3a3a3'},
    {id:'c15',emoji:'🦋',color:'#ec4899'},
    {id:'c16',emoji:'🏔️',color:'#64748b'},
    {id:'c17',emoji:'🔥',color:'#f97316'},
    {id:'c18',emoji:'🌙',color:'#94a3b8'},
  ];
  const STORAGE_KEY = 'multiplication_unlocked_cards_v1';
  let unlocked = new Set();

  // audio utilities (WebAudio) — simple tones and chimes
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = AudioCtx ? new AudioCtx() : null;
  function playTone(freq, duration=0.08, type='sine', gain=0.08){
    if(!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    setTimeout(()=>o.stop(), duration*1000 + 20);
  }
  function playClick(){ playTone(800,0.04,'square',0.05); }
  function playCorrect(){ playTone(880,0.06,'sine',0.06); playTone(1320,0.05,'sine',0.03); }
  function playFail(){ playTone(240,0.12,'sawtooth',0.08); }
  function playFanfare(){ if(!audioCtx) return; const now = audioCtx.currentTime; const freqs = [523,659,783,1046]; freqs.forEach((f,i)=>{ const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.frequency.value = f; o.type='triangle'; g.gain.value=0.06*(1/(i+1)); o.connect(g); g.connect(audioCtx.destination); o.start(now + i*0.12); g.gain.exponentialRampToValueAtTime(0.0001, now + i*0.12 + 0.4); setTimeout(()=>o.stop(), (i*120)+520); }); }

  function loadUnlocked(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){ JSON.parse(raw).forEach(id=>unlocked.add(id)); }
    }catch(e){ unlocked = new Set(); }
  }
  function saveUnlocked(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(unlocked))); }catch(e){}
  }
  function renderTreasure(){
    cardsEl.innerHTML = '';
    CARDS.forEach(c=>{
      const d = document.createElement('div');
      d.className = 'card' + (unlocked.has(c.id)?'':' locked');
      d.dataset.id = c.id;
      d.title = t(`cards.${c.id}`);
      d.innerHTML = `<div class="emoji">${c.emoji}</div><div class="label">${t(`cards.${c.id}`)}</div>`;
      cardsEl.appendChild(d);
    });
  }
  // reset unlocked cards: show an on-screen confirmation modal
  function resetUnlocked(){
    if(!resetModal) return;
    resetModal.classList.remove('hidden');
    resetModal.setAttribute('aria-hidden','false');
    // focus confirm for quick keyboard access
    if(confirmResetBtn) confirmResetBtn.focus();
  }

  function performReset(){
    unlocked.clear();
    saveUnlocked();
    renderTreasure();
    hideResetModal();
  }

  function hideResetModal(){
    if(!resetModal) return;
    resetModal.classList.add('hidden');
    resetModal.setAttribute('aria-hidden','true');
  }
  function unlockCard(){
    const locked = CARDS.filter(c=>!unlocked.has(c.id));
    if(locked.length===0) return null;
    const pick = locked[Math.floor(Math.random()*locked.length)];
    unlocked.add(pick.id);
    saveUnlocked();
    renderTreasure();
    return pick;
  }

  function makeTables(){
    for(let t=2;t<=9;t++){
      const btn = document.createElement('button');
      btn.textContent = t;
      btn.className = 'table-btn';
      btn.addEventListener('click', ()=>{
        if(selectedTables.has(t)){
          selectedTables.delete(t); btn.classList.remove('selected');
        } else { selectedTables.add(t); btn.classList.add('selected'); }
        updateStartState();
      });
      tablesEl.appendChild(btn);
    }
  }

  function updateStartState(){
    const count = selectedTables.size;
    startBtn.disabled = count === 0;
  }

  function genProblems(){
    const tables = Array.from(selectedTables);
    const seen = new Map();
    const pool = [];
    tables.forEach(t=>{
      for(let m=1;m<=10;m++){
        const a = t, b = m;
        const keyA = Math.min(a,b);
        const keyB = Math.max(a,b);
        const key = keyA + 'x' + keyB; // unordered key
        if(!seen.has(key)){
          seen.set(key, true);
          pool.push({key, baseA: keyA, baseB: keyB, answer: keyA*keyB});
        }
      }
    });

    function shuffle(arr){
      for(let i=arr.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [arr[i],arr[j]] = [arr[j],arr[i]];
      }
      return arr;
    }

    shuffle(pool);

    const out = [];
    const orientation = new Map();
    let idx = 0;
    while(out.length < NUM_PROBLEMS){
      const p = pool[idx % pool.length];
      // choose orientation once per unordered key and reuse for repeats
      if(!orientation.has(p.key)){
        orientation.set(p.key, Math.random() < 0.5);
      }
      const flip = orientation.get(p.key);
      const a = flip ? p.baseB : p.baseA;
      const b = flip ? p.baseA : p.baseB;
      out.push({a, b, answer: p.answer, userAnswer: null});
      idx++;
    }
    return out;
  }

  function showSetup(){
    setupEl.classList.remove('hidden');
    gameEl.classList.add('hidden');
    resultEl.classList.add('hidden');
  }

  function startGame(){
    problems = genProblems();
    current = 0; inputBuffer='';
    startTime = performance.now();
    updateProgress();
    renderProgressTrack();
    updateTrack();
    showProblem();
    setupEl.classList.add('hidden');
    gameEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    timerEl.textContent = TIME_LIMIT + 's';
    timerId = setInterval(updateTimer,100);
  }

  function updateTimer(){
    const elapsed = (performance.now()-startTime)/1000;
    const left = Math.max(0,TIME_LIMIT-elapsed);
    timerEl.textContent = Math.ceil(left)+ t('game.timer');
    if(elapsed>=TIME_LIMIT){
      endGame(true);
    }
  }

  function updateProgress(){
    progressEl.textContent = (current) + t('game.progress') + NUM_PROBLEMS;
    updateTrack();
  }

  function showProblem(){
    const p = problems[current];
    problemEl.textContent = p.a + ' × ' + p.b;
    inputBuffer = '';
    renderInput();
    updateProgress();
  }

  function renderProgressTrack(){
    if(!trackEl) return;
    trackEl.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'progress-track-inner';
    // create obstacle elements
    for(let i=0;i<NUM_PROBLEMS;i++){
      const o = document.createElement('div');
      o.className = 'track-obstacle';
      o.dataset.index = i;
      if(i === NUM_PROBLEMS - 1){
        o.classList.add('track-goal');
      }
      inner.appendChild(o);
    }
    // ninja element
    const ninja = document.createElement('div');
    ninja.className = 'ninja';
    ninja.id = 'trackNinja';
    ninja.textContent = '🥷';
    inner.appendChild(ninja);
    trackEl.appendChild(inner);
  }

  function updateTrack(){
    if(!trackEl) return;
    const ninja = trackEl.querySelector('#trackNinja');
    const obstacles = Array.from(trackEl.querySelectorAll('.track-obstacle'));
    if(!ninja || obstacles.length===0) return;
    // position ninja centered over the appropriate obstacle square
    const inner = trackEl.querySelector('.progress-track-inner');
    if(!inner) return;
    const total = obstacles.length;
    // choose target obstacle index (cap to last index)
    const targetIdx = Math.min(current, total - 1);
    const target = obstacles[targetIdx];
    // compute center of target relative to inner container and set left as percent
    const innerRect = inner.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const centerX = targetRect.left + targetRect.width / 2;
    const leftPx = centerX - innerRect.left;
    const pct = innerRect.width > 0 ? Math.max(0, Math.min(100, (leftPx / innerRect.width) * 100)) : 0;
    ninja.style.left = pct + '%';
    // mark cleared obstacles based on correctness
    obstacles.forEach((el,i)=>{
      el.classList.remove('cleared-correct','cleared-wrong');
      const p = problems[i];
      if(p && p.userAnswer !== null && typeof p.userAnswer !== 'undefined'){
        if(p.userAnswer === p.answer){ el.classList.add('cleared-correct'); }
        else { el.classList.add('cleared-wrong'); }
      }
    });
    // small jump effect when just answered
    ninja.classList.add('jump');
    setTimeout(()=> ninja.classList.remove('jump'), 380);
  }

  function renderInput(){
    answerDisplay.textContent = inputBuffer || '—';
  }

  function submitCurrent(){
    if(inputBuffer==='') return;
    const val = parseInt(inputBuffer,10);
    problems[current].userAnswer = Number.isFinite(val)?val:null;
    // son de feedback immédiat
    if(problems[current].userAnswer === problems[current].answer) playCorrect(); else playFail();
    current++;
    if(current>=problems.length){
      endGame(false);
    } else {
      showProblem();
    }
  }

  function endGame(timeUp){
    clearInterval(timerId);
    const elapsed = (performance.now()-startTime)/1000;
    const allAnswered = problems.every(p=>p.userAnswer!==null);
    const allCorrect = problems.every(p=>p.userAnswer===p.answer);
    const timeOk = elapsed<=60;
    if(!allAnswered && !timeUp){
      // if not all answered but time didn't run out, treat unanswered as incorrect
    }
    const lines = [];
    if(!timeOk || timeUp) lines.push(`<div><strong>Temps :</strong> ${elapsed.toFixed(2)}s (limite ${TIME_LIMIT}s)</div>`);

    // Build full problems log formatted: errors show attempted answer then ❌ then correct; correct show ✅
    const problemsList = problems.map((p,i)=>{
      const user = p.userAnswer===null?'<em>—</em>':p.userAnswer;
      const ok = p.userAnswer===p.answer;
      if(ok){
        return `<div><span class="short-column">${i+1}.</span> <span class="long-column">${p.a}×${p.b} = ${p.answer}</span> <span class="column">✅</span></div>`;
      } else {
        return `<div><span class="short-column">${i+1}.</span> <span class="long-column">${p.a}×${p.b} = ${user}</span> <span class="column">❌</span> <span class="column">${p.answer}</span></div>`;
      }
    }).join('');

    const success = allCorrect && timeOk && !timeUp;
    let pendingResult = {title:'', html:''};

    // compute score and label
    const score = problems.reduce((acc,p)=> acc + (p.userAnswer===p.answer?1:0), 0);
    let label = '';
    if(score < NUM_PROBLEMS/2) label = t('scores.low');
    else if(score < NUM_PROBLEMS * 0.7) label = t('scores.medium');
    else if(score < NUM_PROBLEMS * 0.9) label = t('scores.good');
    else if(score < NUM_PROBLEMS) label = t('scores.great');
    else label = t('scores.perfect');

    const head = (!timeOk || timeUp) ? `<div><strong>${t('result.timeLabel')}</strong> ${elapsed.toFixed(2)}s (limite ${TIME_LIMIT}s)</div>` : '';
    pendingResult.title = `${score} / ${NUM_PROBLEMS} ${t('result.title')} ${label}`;


    if(success){
        const unlockedCard = unlockCard();
        const cardMsg = unlockedCard ? `<div><strong>${t('result.newCardLabel')}</strong> ${unlockedCard.emoji} ${t(`cards.${unlockedCard.id}`)}</div>` : `<div><strong>${t('result.allCardsLabel')}</strong></div>`;
        pendingResult.html = [head, cardMsg, `<div><strong>${t('result.problemsLabel')}</strong>${problemsList}</div>`].join('');
        pendingResult.unlockedCard = unlockedCard ? unlockedCard.id : null;
    } else {
        pendingResult.unlockedCard = null;
        const errors = problems.map((p,i)=>({i,p})).filter(o=>o.p.userAnswer!==o.p.answer);
        pendingResult.html = [head, `<div><strong>${t('result.problemsLabel')}</strong>${problemsList}</div>`].join('');
    }

    // Show animation for 3 seconds then show result
    gameEl.classList.add('hidden');
    showAnimation(success, pendingResult);
    progressEl.textContent = NUM_PROBLEMS + ' / ' + NUM_PROBLEMS;
  }

  function makeKeypad(){
    const keys = ['1','2','3','4','5','6','7','8','9','←','0','↵'];
    keys.forEach(k=>{
      const b = document.createElement('button');
      b.className = 'key';
      b.textContent = k;
      // annotate special actions to avoid depending on glyph equality
      if(k === '←'){
        b.dataset.action = 'back';
        b.setAttribute('aria-label','Backspace');
      } else if(k === '↵'){
        b.dataset.action = 'enter';
        b.setAttribute('aria-label','Enter');
      } else {
        b.dataset.action = 'digit';
        b.dataset.digit = k;
        b.setAttribute('aria-label',`Digit ${k}`);
      }
      b.addEventListener('click', (ev)=>{
        const action = b.dataset.action;
        if(action === 'back'){
          inputBuffer = inputBuffer.slice(0,-1);
          renderInput();
        } else if(action === 'enter'){
          submitCurrent();
        } else if(action === 'digit'){
          const digit = b.dataset.digit;
          if(inputBuffer.length<3) inputBuffer += digit;
          renderInput();
          playClick();
        }
      });
      keypadEl.appendChild(b);
    });
  }

  function showAnimation(success, pendingResult){
    if(!animEl || !animContent){
      // fallback: directly show result
      resultTitle.textContent = pendingResult.title;
      resultDetails.innerHTML = pendingResult.html;
      resultEl.classList.remove('hidden');
      return;
    }
    animContent.innerHTML = '';
    animEl.classList.remove('hidden');
    // allow click to dismiss animation if it ever gets stuck
    const onAnimClick = () => {
      animEl.classList.add('hidden');
      animEl.removeEventListener('click', onAnimClick);
    };
    animEl.addEventListener('click', onAnimClick);
    // success animation: confetti + pop
    if(success){
      const burst = document.createElement('div');
      burst.className = 'celebrate-burst';
      burst.textContent = pendingResult.title;
      animContent.appendChild(burst);
      // create confetti pieces
      const confettiEmojis = ['🎊','✨','🎈','🌟','🪄'];
      for(let i=0;i<22;i++){
        const e = document.createElement('div');
        e.className = 'confetti';
        e.style.left = (Math.random()*90+5) + 'vw';
        e.style.fontSize = (14 + Math.floor(Math.random()*28)) + 'px';
        e.style.animationDuration = (1800 + Math.floor(Math.random()*1200)) + 'ms';
        e.textContent = confettiEmojis[Math.floor(Math.random()*confettiEmojis.length)];
        document.body.appendChild(e);
        // remove after animation
        setTimeout(()=>{ try{ document.body.removeChild(e); }catch(e){} }, 3200);
      }
      playFanfare();
    } else {
      // failure animation: big shake
      const fail = document.createElement('div');
      fail.className = 'fail-shake';
      fail.textContent = pendingResult.title;
      animContent.appendChild(fail);
    }

    // after 3s show pending result
    setTimeout(()=>{
      animEl.classList.add('hidden');
      resultTitle.textContent = pendingResult.title;
      resultDetails.innerHTML = pendingResult.html;
      resultEl.classList.remove('hidden');
      // if a new card was unlocked, animate it in the treasure box
      if(pendingResult.unlockedCard){
        const cardEl = cardsEl.querySelector(`[data-id="${pendingResult.unlockedCard}"]`);
        if(cardEl){
          // ensure unlocked styling applied (renderTreasure already updated it)
          cardEl.classList.remove('locked');
          cardEl.classList.add('card-unlock');
          // briefly bring into view
          cardEl.scrollIntoView({behavior:'smooth',block:'center'});
          setTimeout(()=>{ cardEl.classList.remove('card-unlock'); }, 1400);
        }
      }
    }, 3000);
  }

  startBtn.addEventListener('click', ()=>{
    if(selectedTables.size===0) return;
    startGame();
  });

  retryBtn.addEventListener('click', ()=>{
    startGame();
  });
  backSetupBtn.addEventListener('click', ()=>{
    clearInterval(timerId);
    showSetup();
  });

  // Language switcher
  function setupLanguageSwitcher(){
    console.log('Setting up language switcher', {languageBtn, languageModal});
    if(!languageBtn || !languageModal) {
      console.error('Language switcher elements not found');
      return;
    }
    languageBtn.addEventListener('click', (e)=>{
      console.log('Language button clicked');
      e.stopPropagation();
      languageModal.classList.remove('hidden');
      languageModal.setAttribute('aria-hidden','false');
    });
    document.addEventListener('click', (e)=>{
      if(!languageBtn.contains(e.target) && !languageModal.contains(e.target)){
        languageModal.classList.add('hidden');
        languageModal.setAttribute('aria-hidden','true');
      }
    });
    languageModal.querySelectorAll('.language-option').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const lang = btn.getAttribute('data-lang');
        console.log('Switching to language:', lang);
        loadLanguage(lang);
        languageModal.classList.add('hidden');
        languageModal.setAttribute('aria-hidden','true');
      });
    });
    if(closeLanguageModalBtn){
      closeLanguageModalBtn.addEventListener('click', ()=>{
        languageModal.classList.add('hidden');
        languageModal.setAttribute('aria-hidden','true');
      });
    }
    languageModal.addEventListener('click', (e)=>{
      if(e.target === languageModal){
        languageModal.classList.add('hidden');
        languageModal.setAttribute('aria-hidden','true');
      }
    });
    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape'){
        if(languageModal && !languageModal.classList.contains('hidden')){
          languageModal.classList.add('hidden');
          languageModal.setAttribute('aria-hidden','true');
        }
      }
    });
  }

  // init
  const initialLang = detectLanguage();
  // Immediately hide setup until language is loaded to prevent flash
  setupEl.classList.add('hidden');
  loadLanguage(initialLang).then(()=>{
    makeTables();
    loadUnlocked();
    renderTreasure();
    updateStartState();
    makeKeypad();
    if(resetCardsBtn) resetCardsBtn.addEventListener('click', resetUnlocked);
    // modal buttons
    if(confirmResetBtn) confirmResetBtn.addEventListener('click', performReset);
    if(cancelResetBtn) cancelResetBtn.addEventListener('click', hideResetModal);
    if(resetModal) resetModal.addEventListener('click', (e)=>{ if(e.target===resetModal) hideResetModal(); });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ if(resetModal && !resetModal.classList.contains('hidden')) hideResetModal(); } });
    setupLanguageSwitcher();
    showSetup();
  });
})();

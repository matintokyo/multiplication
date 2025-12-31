(() => {
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

  let selectedTables = new Set();
  let problems = [];
  let current = 0;
  let startTime = 0;
  let timerId = null;
  let inputBuffer = '';
  // cartes collectionnables (emoji). Noms en français.
  const CARDS = [
    {id:'c1',name:'Étoile d\'or',emoji:'🌟',color:'#f59e0b'},
    {id:'c2',name:'Fusée',emoji:'🚀',color:'#06b6d4'},
    {id:'c3',name:'Trésor',emoji:'🧰',color:'#ef4444'},
    {id:'c4',name:'Médaille',emoji:'🏅',color:'#10b981'},
    {id:'c5',name:'Couronne',emoji:'👑',color:'#f97316'},
    {id:'c6',name:'Licorne',emoji:'🦄',color:'#8b5cf6'},
    {id:'c7',name:'Diamant',emoji:'💎',color:'#3b82f6'},
    {id:'c8',name:'Planète',emoji:'🪐',color:'#06b6d4'}
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
      d.title = c.name;
      d.innerHTML = `<div class="emoji">${c.emoji}</div><div class="label">${c.name}</div>`;
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
    while(out.length < 20){
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
    showProblem();
    setupEl.classList.add('hidden');
    gameEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    timerEl.textContent = '60s';
    timerId = setInterval(updateTimer,100);
  }

  function updateTimer(){
    const elapsed = (performance.now()-startTime)/1000;
    const left = Math.max(0,60-elapsed);
    timerEl.textContent = Math.ceil(left)+ 's';
    if(elapsed>=60){
      endGame(true);
    }
  }

  function updateProgress(){
    progressEl.textContent = (current) + ' / 20';
  }

  function showProblem(){
    const p = problems[current];
    problemEl.textContent = p.a + ' × ' + p.b;
    inputBuffer = '';
    renderInput();
    updateProgress();
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
    if(!timeOk || timeUp) lines.push(`<div><strong>Temps :</strong> ${elapsed.toFixed(2)}s (limite 60s)</div>`);

    // Build full problems log formatted: errors show attempted answer then ❌ then correct; correct show ✅
    const problemsList = problems.map((p,i)=>{
      const user = p.userAnswer===null?'<em>—</em>':p.userAnswer;
      const ok = p.userAnswer===p.answer;
      if(ok){
        return `<div>${i+1}. ${p.a}×${p.b} = ${p.answer} ✅</div>`;
      } else {
        return `<div>${i+1}. ${p.a}×${p.b} = ${user} ❌ ${p.answer}</div>`;
      }
    }).join('');

    const success = allCorrect && timeOk && !timeUp;
    let pendingResult = {title:'', html:''};

    if(success){
      const unlockedCard = unlockCard();
      const head = `<div><strong>Terminé en :</strong> ${elapsed.toFixed(2)}s</div>`;
      const cardMsg = unlockedCard ? `<div><strong>Nouvelle carte débloquée :</strong> ${unlockedCard.emoji} ${unlockedCard.name}</div>` : `<div><strong>Toutes les cartes sont débloquées !</strong></div>`;
      pendingResult.title = '🎉 Bravo !';
      pendingResult.html = [head, cardMsg, `<div><strong>Problèmes :</strong>${problemsList}</div>`].join('');
      pendingResult.unlockedCard = unlockedCard ? unlockedCard.id : null;
    } else {
      const head = (!timeOk || timeUp) ? `<div><strong>Temps :</strong> ${elapsed.toFixed(2)}s (limite 60s)</div>` : '';
      const errors = problems.map((p,i)=>({i,p})).filter(o=>o.p.userAnswer!==o.p.answer);
      let errHtml = '';
      if(errors.length){
        const list = errors.map(e=>`<div>${e.i+1}. ${e.p.a}×${e.p.b} = ${e.p.answer} — vous: ${e.p.userAnswer===null?'<em>pas de réponse</em>':e.p.userAnswer}</div>`).join('');
        errHtml = `<div><strong>Erreurs :</strong>${list}</div>`;
      }
      pendingResult.title = 'Pas cette fois';
      pendingResult.html = [head, errHtml, `<div><strong>Problèmes :</strong>${problemsList}</div>`].join('');
      pendingResult.unlockedCard = null;
    }

    // Show animation for 3 seconds then show result
    gameEl.classList.add('hidden');
    showAnimation(success, pendingResult);
    progressEl.textContent = '20 / 20';
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
      burst.textContent = '🎉';
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
      fail.textContent = '❌';
      animContent.appendChild(fail);
      playFail();
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

  // init
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
  showSetup();
})();

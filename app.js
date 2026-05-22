const SUPABASE_URL = "https://hvwbwlidzpktwlsnngtb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d2J3bGlkenBrdHdsc25uZ3RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjQxMzgsImV4cCI6MjA5NDgwMDEzOH0.O4AT3LX3vjaucao858G0_795V_ZUd31vdiJGUqOBCt4";
const HEARTBEAT_INTERVAL_MS = 5000;
const PRESENCE_TIMEOUT_MS = 15000;
const SNAPSHOT_REFRESH_MS = 5000;

const DUEL_CONFIG = {
  READY_MIN_PER_SIDE: 3,
  COUNTDOWN_SEC: 5,
  DUEL_DURATION_SEC: 30,
  INTERMISSION_SEC: 10, 
  SYNC_INTERVAL_MS: 1000 
};

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const state = {
  authMode: "login",
  session: null,
  currentPlayer: null,
  activePlayers: [],
  isAuthBusy: false,
  isSideBusy: false,
  heartbeatTimerId: null,
  refreshTimerId: null,
  authBootstrapVersion: 0,
  
  gameStatus: "waiting", // waiting, ready_check, countdown, active, finishing, intermission, finished
  localPulls: 0,
  localTotalMatchPulls: 0, // TOTAL ABSOLUTO para sincro perfecta
  totalPullsLeft: 0,
  totalPullsRight: 0,
  countdownTime: 0,
  duelTime: 0,
  intermissionTime: 0,
  targetTime: 0, 
  syncTimerId: null,
  duelTimerId: null,
  duelChannel: null,
  matchScores: {},
  
  isReady: false,
  readyPlayers: new Set(),
  audioEnabled: true,
  audioUnlocked: false,
  audioContext: null,
  audioFadeTimers: {},
  soundLastPlayed: {},
  lastImbalanceAlertAt: 0,
  lastImbalanceKey: "",
  currentDominantSide: null,
  isHighImbalance: false,
  tensionStartTimerId: null,
  tensionEndTimerId: null,
  dominanceAudioPhase: "idle",
  lastDominantVoiceAt: 0,
  lastDominantVoiceSide: null,
  audioSessionId: 0
};

const dom = {
  authPanel: document.getElementById("authPanel"),
  authForm: document.getElementById("authForm"),
  loginTab: document.getElementById("loginTab"),
  registerTab: document.getElementById("registerTab"),
  aliasInput: document.getElementById("aliasInput"),
  passwordInput: document.getElementById("passwordInput"),
  passwordToggleBtn: document.getElementById("passwordToggleBtn"),
  authSubmitBtn: document.getElementById("authSubmitBtn"),
  authFeedback: document.getElementById("authFeedback"),
  gameUI: document.getElementById("gameUI"),
  logoutBtn: document.getElementById("logoutBtn"),
  audioToggleBtn: document.getElementById("audioToggleBtn"),
  globalAudioBtn: document.getElementById("globalAudioBtn"),
  leftBtn: document.getElementById("leftBtn"),
  rightBtn: document.getElementById("rightBtn"),
  currentSideText: document.getElementById("currentSide"),
  playerAliasLabel: document.getElementById("playerAliasLabel"),
  playerInfo: document.getElementById("playerInfo"),
  sessionIndicator: document.getElementById("sessionIndicator"),
  sessionStatusText: document.getElementById("sessionStatusText"),
  statusBanner: document.getElementById("statusBanner"),
  toggleHudBtn: document.getElementById("toggleHudBtn"),
  marcador3D: document.getElementById("marcador-texto"),
  reclutamientoTexto: document.getElementById("reclutamiento-texto"),
  timerTexto: document.getElementById("timer-texto"),
  leaderboardList: document.getElementById("leaderboardList"),
  resultsModal: document.getElementById("resultsModal"),
  modalWinnerTitle: document.getElementById("modalWinnerTitle"),
  modalMVPAlias: document.getElementById("modalMVPAlias"),
  modalMVPScore: document.getElementById("modalMVPScore"),
  modalPersonalPulls: document.getElementById("modalPersonalPulls"),
  modalCountdown: document.getElementById("modalCountdown"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  historyModal: document.getElementById("historyModal"),
  historyList: document.getElementById("historyList"),
  showHistoryBtn: document.getElementById("showHistoryBtn"),
  closeHistoryBtn: document.getElementById("closeHistoryBtn"),
  readyBtn: document.getElementById("readyBtn")
};

bindUI();
initApp().catch(handleUnexpectedError);

function bindUI() {
  if (dom.authForm) dom.authForm.addEventListener("submit", handleAuthSubmit);
  if (dom.loginTab) dom.loginTab.addEventListener("click", () => setAuthMode("login"));
  if (dom.registerTab) dom.registerTab.addEventListener("click", () => setAuthMode("register"));
  if (dom.passwordToggleBtn) dom.passwordToggleBtn.addEventListener("click", togglePasswordVisibility);
  if (dom.audioToggleBtn) dom.audioToggleBtn.addEventListener("click", toggleAudio);
  if (dom.globalAudioBtn) dom.globalAudioBtn.addEventListener("click", enableAudioFromUserGesture);
  if (dom.leftBtn) dom.leftBtn.addEventListener("click", () => chooseSide("LEFT"));
  if (dom.rightBtn) dom.rightBtn.addEventListener("click", () => chooseSide("RIGHT"));
  if (dom.logoutBtn) dom.logoutBtn.addEventListener("click", handleLogout);
  if (dom.toggleHudBtn) dom.toggleHudBtn.addEventListener("click", toggleHudVisibility);
  if (dom.closeModalBtn) dom.closeModalBtn.addEventListener("click", () => dom.resultsModal.classList.add("hidden"));
  if (dom.readyBtn) dom.readyBtn.addEventListener("click", handleReadyToggle);
  if (dom.showHistoryBtn) dom.showHistoryBtn.addEventListener("click", openHistoryModal);
  if (dom.closeHistoryBtn) dom.closeHistoryBtn.addEventListener("click", () => dom.historyModal.classList.add("hidden"));

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    const isAudioButton = button && (button === dom.audioToggleBtn || button === dom.globalAudioBtn);
    if (button && !isAudioButton) playSound("sound-button", true);
    updateMusic();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && state.gameStatus === "active" && state.currentPlayer?.side) {
      handlePull(state.currentPlayer.side);
    }
  });

  window.addEventListener("touchstart", (e) => {
      if (state.gameStatus === "active" && state.currentPlayer?.side) {
          if (e.target.tagName !== "BUTTON" && e.target.tagName !== "INPUT") {
              handlePull(state.currentPlayer.side);
          }
      }
  }, { passive: false });

  window.addEventListener("mousedown", (e) => {
      if (state.gameStatus === "active" && state.currentPlayer?.side) {
          if (e.target.tagName !== "BUTTON" && e.target.tagName !== "INPUT" && e.button === 0) {
              handlePull(state.currentPlayer.side);
          }
      }
  });

  window.addEventListener("pagehide", flushPresenceOnExit);
  window.addEventListener("beforeunload", flushPresenceOnExit);
  window.addEventListener("beforeunload", () => {
    stopAllAudio();
});
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function togglePasswordVisibility() {
  if (!dom.passwordInput || !dom.passwordToggleBtn) return;
  const willShow = dom.passwordInput.type === "password";
  dom.passwordInput.type = willShow ? "text" : "password";
  dom.passwordToggleBtn.setAttribute("aria-pressed", String(willShow));
  dom.passwordToggleBtn.setAttribute("aria-label", willShow ? "Ocultar contrasena" : "Mostrar contrasena");
  dom.passwordToggleBtn.title = willShow ? "Ocultar contrasena" : "Mostrar contrasena";
}

async function toggleAudio() {
  if (state.audioEnabled) {
    state.audioEnabled = false;
    stopAllAudio();
    showGlobalAudioButton(false);
    syncAudioToggle();
    return;
  }

  await enableAudioFromUserGesture();
}

async function enableAudioFromUserGesture() {
  state.audioEnabled = true;
  state.audioSessionId += 1;
  syncAudioToggle();
  const unlocked = await unlockAudioFromUserGesture();
  if (!unlocked) {
    state.audioEnabled = false;
    state.audioSessionId += 1;
    syncAudioToggle();
    return;
  }
  resetDominanceAudioState();
  updateMusic();
}

function syncAudioToggle() {
  if (!dom.audioToggleBtn) return;
  dom.audioToggleBtn.setAttribute("aria-pressed", String(state.audioEnabled));
  dom.audioToggleBtn.setAttribute("aria-label", state.audioEnabled ? "Desactivar audio" : "Activar audio");
  dom.audioToggleBtn.title = state.audioEnabled ? "Desactivar audio" : "Activar audio";
  dom.audioToggleBtn.innerHTML = state.audioEnabled
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"></path><path d="M16 8.5c1.2 1.7 1.2 5.3 0 7"></path><path d="M18.5 6c2 3 2 9 0 12"></path></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"></path><path d="M19 9l-6 6"></path><path d="M13 9l6 6"></path></svg>`;
}

function showGlobalAudioButton(show) {
  if (!dom.globalAudioBtn) return;
  dom.globalAudioBtn.classList.toggle("hidden", !show);
}

function syncAudioStateFromMain() {
    const main = document.getElementById("music-main");
    if (!main || main.paused || !main.getAttribute("src")) return;
    if (state.audioEnabled && state.audioUnlocked) return;
    state.audioEnabled = true;
    state.audioUnlocked = true;
    showGlobalAudioButton(false);
    syncAudioToggle();
}

function isMasterClient() {
    if (!state.currentPlayer || state.activePlayers.length === 0) return false;
    const sorted = [...state.activePlayers].sort((a, b) => a.id.localeCompare(b.id));
    return sorted[0].id === state.currentPlayer.id;
}

function toggleHudVisibility() {
  const isHidden = dom.gameUI.classList.toggle("hidden");
  dom.toggleHudBtn.textContent = isHidden ? "🔼" : "🔽";
}

function handleReadyToggle() {
    state.isReady = !state.isReady;
    dom.readyBtn.textContent = state.isReady ? "¡LISTO! (Cancelar)" : "¡ESTOY LISTO!";
    dom.readyBtn.style.background = state.isReady ? "var(--success)" : "var(--neutral)";
    if (state.duelChannel) {
        state.duelChannel.send({
            type: "broadcast", event: "player-ready",
            payload: { playerId: state.currentPlayer.id, isReady: state.isReady }
        });
    }
    if (state.isReady) state.readyPlayers.add(state.currentPlayer.id);
    else state.readyPlayers.delete(state.currentPlayer.id);
    if (isMasterClient()) checkStartCondition();
}

function handlePull(side) {
  if (state.gameStatus !== "active") return;
  state.localPulls++;
  state.localTotalMatchPulls++;
  const offset = side === "LEFT" ? -0.02 : 0.02;
  if (typeof applyLocalMove === "function") applyLocalMove(offset);
  if (typeof animatePull === "function" && state.currentPlayer) animatePull(state.currentPlayer.id);
  playSound("sound-pull", true);
}

async function initApp() {
  setAuthMode("login"); if (typeof initScene === "function") initScene();
  prepareAudioAssets();
  syncAudioToggle();
  attemptInitialMainAudio();
  toggleGameUI(false); setStatus("Inicializando sesion...", "info");
  subscribeToPlayersRealtime(); subscribeToDuelEvents();
  db.auth.onAuthStateChange((_event, session) => { handleSessionChange(session).catch(handleUnexpectedError); });
  const { data: { session } } = await db.auth.getSession(); await handleSessionChange(session);
}

function subscribeToDuelEvents() {
  state.duelChannel = db.channel("duel-room");
  state.duelChannel
    .on("broadcast", { event: "sync-pulls" }, ({ payload }) => {
      if (state.gameStatus === "active" || state.gameStatus === "finishing") {
        if (payload.playerId) state.matchScores[payload.playerId] = payload.total;
        recalculateTeamTotals();
        if (typeof syncRopeWithPulls === "function") syncRopeWithPulls(state.totalPullsLeft, state.totalPullsRight);
        if (typeof animatePull === "function" && payload.playerId && payload.delta > 0) animatePull(payload.playerId);
      }
    })
    .on("broadcast", { event: "player-ready" }, ({ payload }) => {
        if (payload.isReady) state.readyPlayers.add(payload.playerId);
        else state.readyPlayers.delete(payload.playerId);
        if (isMasterClient()) checkStartCondition();
    })
    .on("broadcast", { event: "game-state" }, ({ payload }) => {
      if (state.gameStatus === payload.status && state.targetTime === payload.targetTime) return;
      state.gameStatus = payload.status;
      state.targetTime = payload.targetTime;
      if (state.gameStatus === "countdown") startCountdown(false);
      else if (state.gameStatus === "active") startDuel(false);
      else if (state.gameStatus === "intermission") startIntermission(false);
      updateDuelUI();
    })
    .on("broadcast", { event: "final-sync-request" }, () => {
        syncLocalPulls(); 
        showResultsLoader();
    })
    .on("broadcast", { event: "match-finished" }, ({ payload }) => {
        state.totalPullsLeft = payload.pullsLeft;
        state.totalPullsRight = payload.pullsRight;
        state.matchScores = payload.scores;
        showResults(payload.winnerSide, payload.mvpId, payload.mvpAlias, payload.mvpScore);
    })
    .subscribe();
  state.syncTimerId = setInterval(syncLocalPulls, DUEL_CONFIG.SYNC_INTERVAL_MS);
}

function recalculateTeamTotals() {
    let left = 0; let right = 0;
    // Usar matchScores como base para asegurar que no se pierdan datos de ningún cliente
    Object.keys(state.matchScores).forEach(playerId => {
        const score = state.matchScores[playerId] || 0;
        const player = state.activePlayers.find(p => p.id === playerId);
        if (player) {
            if (player.side === "LEFT") left += score;
            else if (player.side === "RIGHT") right += score;
        }
    });
    state.totalPullsLeft = left; state.totalPullsRight = right;
}

function syncLocalPulls() {
  if ((state.gameStatus !== "active" && state.gameStatus !== "finishing") || !state.duelChannel || !state.currentPlayer) return;
  
  // Actualizar localmente para que el Master se incluya a sí mismo en el cálculo
  state.matchScores[state.currentPlayer.id] = state.localTotalMatchPulls;
  recalculateTeamTotals();

  state.duelChannel.send({
    type: "broadcast", event: "sync-pulls",
    payload: { playerId: state.currentPlayer.id, side: state.currentPlayer.side, total: state.localTotalMatchPulls, delta: state.localPulls }
  });
  state.localPulls = 0;
}

function broadcastGameState(status, targetTime) {
    if (!state.duelChannel) return;
    state.duelChannel.send({ type: "broadcast", event: "game-state", payload: { status, targetTime } });
}

function checkRecruitment() {
    if (state.gameStatus !== "waiting" && state.gameStatus !== "ready_check") return;
    const left = state.activePlayers.filter(p => p.side === "LEFT").length;
    const right = state.activePlayers.filter(p => p.side === "RIGHT").length;
    if (left >= DUEL_CONFIG.READY_MIN_PER_SIDE && right >= DUEL_CONFIG.READY_MIN_PER_SIDE) {
        state.gameStatus = "ready_check";
        if (dom.readyBtn) dom.readyBtn.classList.remove("hidden");
    } else {
        state.gameStatus = "waiting";
        if (dom.readyBtn) dom.readyBtn.classList.add("hidden");
        state.isReady = false; state.readyPlayers.clear();
        if (dom.readyBtn) { dom.readyBtn.textContent = "¡ESTOY LISTO!"; dom.readyBtn.style.background = "var(--neutral)"; }
    }
    updateDuelUI();
}

function checkStartCondition() {
    if (state.gameStatus === "ready_check" && state.readyPlayers.size >= (DUEL_CONFIG.READY_MIN_PER_SIDE * 2)) {
        startCountdown(true);
    }
}

function startCountdown(isLeader = true) {
    if (state.duelTimerId) clearInterval(state.duelTimerId);
    state.gameStatus = "countdown";
    if (dom.readyBtn) dom.readyBtn.classList.add("hidden");
    if (isLeader) { state.targetTime = Date.now() + (DUEL_CONFIG.COUNTDOWN_SEC * 1000); broadcastGameState("countdown", state.targetTime); }
    state.duelTimerId = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((state.targetTime - Date.now()) / 1000));
        state.countdownTime = remaining;
        if (remaining <= 0) { clearInterval(state.duelTimerId); if (isLeader) startDuel(true); else { state.gameStatus = "active"; updateDuelUI(); } }
        updateDuelUI();
    }, 100); 
}

function startDuel(isLeader = true) {
    if (state.duelTimerId) clearInterval(state.duelTimerId);
    state.gameStatus = "active";
    if (isLeader) {
        state.totalPullsLeft = 0; state.totalPullsRight = 0; state.matchScores = {}; state.localTotalMatchPulls = 0;
        state.targetTime = Date.now() + (DUEL_CONFIG.DUEL_DURATION_SEC * 1000);
        broadcastGameState("active", state.targetTime);
    } else { state.localTotalMatchPulls = 0; }
    state.duelTimerId = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((state.targetTime - Date.now()) / 1000));
        state.duelTime = remaining;
        if (remaining <= 0) { clearInterval(state.duelTimerId); if (isLeader) calculateAndFinishDuel(); else { showResultsLoader(); } }
        updateDuelUI();
    }, 100);
}

function showResultsLoader() {
    state.gameStatus = "finishing";
    const loadingMsg = "PROCESANDO RESULTADOS...";
    if (dom.marcador3D) dom.marcador3D.setAttribute("value", loadingMsg);
    if (dom.timerTexto) dom.timerTexto.setAttribute("value", "ESPERE...");
    if (dom.resultsModal) {
        dom.resultsModal.classList.remove("hidden");
        dom.resultsModal.innerHTML = `<div class="modal-content loader-results"><div class="spinner"></div><h1 style="font-size: 24px;">CALCULANDO GANADOR...</h1><p class="player-info">Sincronizando datos finales de todos los aliens</p></div>`;
    }
}

async function calculateAndFinishDuel() {
    if (state.duelChannel) state.duelChannel.send({ type: "broadcast", event: "final-sync-request" });
    showResultsLoader();
    await new Promise(resolve => setTimeout(resolve, 8000));
    recalculateTeamTotals();
    const winnerSide = state.totalPullsLeft > state.totalPullsRight ? "LEFT" : (state.totalPullsRight > state.totalPullsLeft ? "RIGHT" : null);
    let mvpId = null; let mvpAlias = "Ninguno"; let maxPulls = -1;
    if (winnerSide) {
        const winningTeamPlayers = state.activePlayers.filter(p => p.side === winnerSide);
        winningTeamPlayers.forEach(p => {
            const score = state.matchScores[p.id] || 0;
            if (score > maxPulls) { maxPulls = score; mvpId = p.id; mvpAlias = p.alias; }
        });
    }
    const mvpScore = maxPulls > -1 ? maxPulls : 0;
    if (state.duelChannel) {
        state.duelChannel.send({
            type: "broadcast", event: "match-finished",
            payload: { winnerSide, mvpId, mvpAlias, mvpScore, pullsLeft: state.totalPullsLeft, pullsRight: state.totalPullsRight, scores: state.matchScores }
        });
    }
    showResults(winnerSide, mvpId, mvpAlias, mvpScore);
}

async function showResults(winnerSide, mvpId, mvpAlias, mvpScore) {
    state.gameStatus = "finished";
    const winnerName = winnerSide === "LEFT" ? "VERDE" : (winnerSide === "RIGHT" ? "GRIS" : "EMPATE");
    const mainMsg = winnerSide ? `¡EQUIPO ${winnerName} GANA!` : "¡EMPATE TÉCNICO!";
    const myScore = state.matchScores[state.currentPlayer?.id] || 0;
    if (dom.resultsModal) {
        dom.resultsModal.innerHTML = `<div class="modal-content"><p class="eyebrow">Duelo Finalizado</p><h1 id="modalWinnerTitle"></h1><div class="results-stats"><div class="result-card mvp"><span class="label">HÉROE DE LA PARTIDA (MVP)</span><strong id="modalMVPAlias">---</strong><span class="sub" id="modalMVPScore">0 CLICS</span></div><div class="result-card personal"><span class="label">TU APORTE</span><strong id="modalPersonalPulls">0</strong><span class="sub">CLICS</span></div></div><p class="intermission-countdown">Siguiente ronda en <span id="modalCountdown">10</span>s...</p><button id="closeModalBtn" class="primary-button">Cerrar Resultados</button></div>`;
        const newCloseBtn = dom.resultsModal.querySelector("#closeModalBtn");
        if (newCloseBtn) newCloseBtn.addEventListener("click", () => dom.resultsModal.classList.add("hidden"));
        const title = dom.resultsModal.querySelector("#modalWinnerTitle");
        const mvp = dom.resultsModal.querySelector("#modalMVPAlias");
        const mvpS = dom.resultsModal.querySelector("#modalMVPScore");
        const personal = dom.resultsModal.querySelector("#modalPersonalPulls");
        if (title) { title.textContent = mainMsg; title.style.color = winnerSide === "LEFT" ? "var(--left)" : (winnerSide === "RIGHT" ? "var(--right)" : "var(--neutral)"); }
        if (mvp) mvp.textContent = mvpAlias; if (mvpS) mvpS.textContent = `${mvpScore} CLICS`; if (personal) personal.textContent = myScore;
        dom.resultsModal.classList.remove("hidden");
    }
    if (dom.marcador3D) dom.marcador3D.setAttribute("value", mainMsg);
    if (dom.timerTexto) dom.timerTexto.setAttribute("value", winnerSide ? `MVP: ${mvpAlias}` : "¡BUEN ESFUERZO!");
    setStatus(`${mainMsg}`, "success");
    playSound("sound-win", true);
    if (state.currentPlayer && winnerSide) {
        const iWon = state.currentPlayer.side === winnerSide; const isMVP = state.currentPlayer.id === mvpId;
        try {
            const { data: currentEntry } = await db.from('leaderboard').select('*').eq('player_id', state.currentPlayer.id).maybeSingle();
            if (currentEntry) { await db.from('leaderboard').update({ wins: currentEntry.wins + (iWon ? 1 : 0), total_pulls: currentEntry.total_pulls + myScore, mvp_count: currentEntry.mvp_count + (isMVP ? 1 : 0), updated_at: new Date().toISOString() }).eq('player_id', state.currentPlayer.id); }
            else { await db.from('leaderboard').insert({ player_id: state.currentPlayer.id, alias: state.currentPlayer.alias, wins: iWon ? 1 : 0, total_pulls: myScore, mvp_count: isMVP ? 1 : 0 }); }
            if (isMVP) { await db.from('match_history').insert({ winner_side: winnerSide, total_players: state.activePlayers.length, mvp_id: state.currentPlayer.id }); }
        } catch (e) { console.warn("Error DB:", e); }
    }
    setTimeout(() => { if (isMasterClient()) startIntermission(true); }, 8000);
}

function startIntermission(isLeader = true) {
    if (state.duelTimerId) clearInterval(state.duelTimerId);
    state.gameStatus = "intermission";
    if (isLeader) { state.targetTime = Date.now() + (DUEL_CONFIG.INTERMISSION_SEC * 1000); broadcastGameState("intermission", state.targetTime); }
    state.duelTimerId = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((state.targetTime - Date.now()) / 1000));
        state.intermissionTime = remaining;
        if (dom.modalCountdown) dom.modalCountdown.textContent = remaining;
        updateDuelUI();
        if (remaining <= 0) {
            clearInterval(state.duelTimerId); if (dom.resultsModal) dom.resultsModal.classList.add("hidden");
            state.gameStatus = "waiting"; state.totalPullsLeft = 0; state.totalPullsRight = 0; state.matchScores = {};
            state.isReady = false; state.readyPlayers.clear();
            if (dom.readyBtn) { dom.readyBtn.textContent = "¡ESTOY LISTO!"; dom.readyBtn.style.background = "var(--neutral)"; }
            if (typeof syncRopeWithPulls === "function") syncRopeWithPulls(0, 0);
            checkRecruitment();
        }
    }, 100);
}

async function openHistoryModal() {
    if (dom.historyModal) dom.historyModal.classList.remove("hidden");
    if (dom.leaderboardList) dom.leaderboardList.innerHTML = '<p class="player-info">Cargando...</p>';
    if (dom.historyList) dom.historyList.innerHTML = '<p class="player-info">Cargando...</p>';
    try {
        const { data: rankData } = await db.from('leaderboard').select('*').order('wins', { ascending: false }).order('total_pulls', { ascending: false }).limit(5);
        renderLeaderboard(rankData || []);
        const { data: histData } = await db.from('match_history').select('*, players!mvp_id(alias)').order('created_at', { ascending: false }).limit(10);
        renderMatchHistory(histData || []);
    } catch (e) { console.error("Error al abrir modal:", e); }
}

function renderLeaderboard(data) {
    if (!dom.leaderboardList) return;
    if (data.length === 0) { dom.leaderboardList.innerHTML = '<p class="player-info">Sin datos aún.</p>'; return; }
    dom.leaderboardList.innerHTML = data.map((p, i) => `<div class="leaderboard-item"><span class="rank">#${i + 1}</span><span class="alias">${p.alias}</span><span class="score">${p.wins}W | ${p.total_pulls}P</span></div>`).join('');
}

function renderMatchHistory(data) {
    if (!dom.historyList) return;
    if (data.length === 0) { dom.historyList.innerHTML = '<p class="player-info">Aún no hay batallas.</p>'; return; }
    dom.historyList.innerHTML = data.map(m => `<div class="leaderboard-item" style="margin-bottom: 10px;"><span style="color: ${m.winner_side === 'LEFT' ? 'var(--left)' : 'var(--right)'}">${m.winner_side === 'LEFT' ? 'VERDE' : 'GRIS'}</span><span class="alias">MVP: ${m.players?.alias || 'Anónimo'}</span></div>`).join('');
}

function updateDuelUI() {
    const left = state.activePlayers.filter(p => p.side === "LEFT").length;
    const right = state.activePlayers.filter(p => p.side === "RIGHT").length;
    if (dom.reclutamientoTexto) dom.reclutamientoTexto.setAttribute("value", `Aliens: VERDES ${left} | GRISES ${right}`);
    let mainMsg = ""; let timerMsg = "--:--";
    if (state.gameStatus === "waiting") { mainMsg = "ELIGE UN EQUIPO"; timerMsg = "MODO RECLUTAMIENTO"; }
    else if (state.gameStatus === "ready_check") { mainMsg = "EQUIPOS LISTOS"; timerMsg = `LISTOS: ${state.readyPlayers.size} (MIN. 6)`; }
    else if (state.gameStatus === "countdown") { mainMsg = "¡PREPÁRENSE!"; timerMsg = `DUELO EN ${state.countdownTime}s`; }
    else if (state.gameStatus === "active") { mainMsg = "¡JALEN CON ESPACIO!"; timerMsg = `TIEMPO: ${state.duelTime}s`; }
    else if (state.gameStatus === "finishing") { mainMsg = "SINCRONIZANDO..."; timerMsg = "ESPERE..."; }
    else if (state.gameStatus === "intermission") { mainMsg = "SIGUIENTE RONDA"; timerMsg = `ESPERA: ${state.intermissionTime}s`; }
    else if (state.gameStatus === "finished") {
        const winner = state.totalPullsLeft > state.totalPullsRight ? "VERDE" : (state.totalPullsRight > state.totalPullsLeft ? "GRIS" : "EMPATE");
        mainMsg = winner === "EMPATE" ? "¡EMPATE TÉCNICO!" : `¡EQUIPO ${winner} GANA!`;
        timerMsg = "FIN DEL DUELO";
    }
    if (dom.marcador3D) dom.marcador3D.setAttribute("value", mainMsg);
    if (dom.timerTexto) dom.timerTexto.setAttribute("value", timerMsg);
    updateBalanceFeedback(left, right);
    updateMusic();
}

function updateBalanceFeedback(leftCount, rightCount) {
    if (!dom.playerInfo) return;
    const usingPulls = state.gameStatus === "active" || state.gameStatus === "finishing" || state.gameStatus === "finished";
    const leftValue = usingPulls ? state.totalPullsLeft : leftCount;
    const rightValue = usingPulls ? state.totalPullsRight : rightCount;
    const diff = Math.abs(leftValue - rightValue);
    const total = leftValue + rightValue;
    const dominant = leftValue > rightValue ? "VERDE" : (rightValue > leftValue ? "GRIS" : null);
    const highThreshold = usingPulls ? Math.max(8, Math.ceil(total * 0.35)) : Math.max(2, Math.ceil(total * 0.45));

    dom.playerInfo.classList.remove("balance-ok", "balance-dominant", "balance-alert");

    if (!dominant || diff === 0) {
        dom.playerInfo.textContent = "Equipos balanceados: la cuerda esta pareja.";
        dom.playerInfo.classList.add("balance-ok");
        state.lastImbalanceKey = "";
        state.currentDominantSide = null;
        state.isHighImbalance = false;
        return;
    }

    if (diff >= highThreshold && total > 0) {
        dom.playerInfo.textContent = `Desequilibrio alto: domina ${dominant} por ${diff}.`;
        dom.playerInfo.classList.add("balance-alert");
        state.currentDominantSide = dominant === "VERDE" ? "LEFT" : "RIGHT";
        state.isHighImbalance = true;
        triggerDominanceCue(dominant, diff);
        return;
    }

    dom.playerInfo.textContent = `Equipo dominante: ${dominant} por ${diff}.`;
    dom.playerInfo.classList.add("balance-dominant");
    state.currentDominantSide = dominant === "VERDE" ? "LEFT" : "RIGHT";
    state.isHighImbalance = false;
}

function triggerDominanceCue(dominant, diff) {
    const now = Date.now();
    const alertKey = `${dominant}-${diff}`;
    if (alertKey === state.lastImbalanceKey && now - state.lastImbalanceAlertAt < 4500) return;
    if (now - state.lastImbalanceAlertAt < 2500) return;
    state.lastImbalanceKey = alertKey;
    state.lastImbalanceAlertAt = now;
    setStatus(`Desequilibrio alto: el equipo ${dominant} esta dominando.`, "warning");
}

function prepareAudioAssets() {
    document.querySelectorAll("audio[data-src]").forEach((el) => {
        const src = el.dataset.src;
        if (!src) return;
        if (el.getAttribute("src") === src) return;
        el.volume = getDefaultVolume(el.id);
        el.addEventListener("error", () => {
            console.warn(`[audio] No se pudo cargar ${src}. Revisa ruta/404.`);
            el.removeAttribute("src");
        }, { once: true });
        el.src = src;
        el.load();
    });
}

async function attemptInitialMainAudio() {
    prepareAudioAssets();
    const main = document.getElementById("music-main");
    if (!main || !main.getAttribute("src")) {
        console.warn("[audio] No existe music-main o falta assets/musica_principal.mp3.");
        showGlobalAudioButton(false);
        return;
    }

    try {
        main.loop = true;
        main.muted = false;
        main.volume = 0;
        await main.play();
        state.audioEnabled = true;
        state.audioUnlocked = true;
        state.audioSessionId += 1;
        fadeAudio("music-main", 0.30, 900);
        showGlobalAudioButton(false);
        syncAudioToggle();
    } catch (error) {
        console.warn("[audio] Autoplay bloqueado o play() failed en musica_principal:", error);
        state.audioEnabled = false;
        state.audioUnlocked = false;
        showGlobalAudioButton(false);
        syncAudioToggle();
    }
}

async function unlockAudioFromUserGesture() {
    prepareAudioAssets();
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
        try { await ctx.resume(); } catch (error) { console.warn("[audio] AudioContext bloqueado:", error); }
    }

    const main = document.getElementById("music-main");
    if (!main || !main.getAttribute("src")) {
        console.warn("[audio] No existe music-main o falta assets/musica_principal.mp3.");
        setStatus("No se encontro musica_principal.mp3.", "warning");
        return false;
    }

    const otherAudios = [...document.querySelectorAll("audio[data-src]")].filter(el => el !== main);
    const unlockSilently = otherAudios.map((el) => {
        if (!el.getAttribute("src")) return Promise.resolve();
        const originalMuted = el.muted;
        el.muted = true;
        el.volume = 0;
        el.currentTime = 0;
        return el.play()
            .then(() => {
                el.pause();
                el.currentTime = 0;
                el.muted = originalMuted;
                el.volume = getDefaultVolume(el.id);
            })
            .catch((error) => {
                el.muted = originalMuted;
                el.volume = getDefaultVolume(el.id);
                console.warn(`[audio] No se pudo desbloquear ${el.id}:`, error);
            });
    });

    try {
        main.loop = true;
        main.muted = false;
        main.volume = 0;
        await main.play();
        await Promise.allSettled(unlockSilently);
        state.audioUnlocked = true;
        showGlobalAudioButton(false);
        fadeAudio("music-main", 0.30, 800);
        setStatus("Audio activado.", "success");
        return true;
    } catch (error) {
        console.warn("[audio] play() failed / NotAllowedError en musica_principal:", error);
        setStatus("El navegador bloqueo el audio. Pulsa Activar audio otra vez.", "warning");
        state.audioUnlocked = false;
        showGlobalAudioButton(true);
        return false;
    }
}

function getDefaultVolume(id) {
    const volumes = {
        "music-main": 0.28,
        "music-tension": 0,
        "voice-green": 0.9,
        "voice-gray": 0.9
    };
    return volumes[id] ?? 0.45;
}

function fadeAudio(id, targetVolume, durationMs = 700) {
    const el = document.getElementById(id);
    if (!el) return;
    const target = Math.max(0, Math.min(1, targetVolume));
    if (state.audioFadeTimers[id]) clearInterval(state.audioFadeTimers[id]);
    const start = Number.isFinite(el.volume) ? el.volume : getDefaultVolume(id);
    const startedAt = performance.now();

    state.audioFadeTimers[id] = setInterval(() => {
        const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
        el.volume = start + ((target - start) * progress);
        if (progress >= 1) {
            clearInterval(state.audioFadeTimers[id]);
            state.audioFadeTimers[id] = null;
            if (target === 0 && !el.paused) {
                el.pause();
                el.currentTime = 0;
            }
        }
    }, 80);
}

function playLoop(id, targetVolume) {
    if (!state.audioEnabled || !state.audioUnlocked) return;

    const el = document.getElementById(id);
    if (!el || !el.getAttribute("src")) return;

    try {
        if (id === "music-tension") {
            el.loop = false;
        } else {
            el.loop = true;
        }

        if (!el.paused) return;

        el.volume = 0;
        el.currentTime = 0;

        el.play()
            .then(() => {
                fadeAudio(id, targetVolume, 700);
            })
            .catch((error) => {
                console.warn(`[audio] play() failed en ${id}:`, error);
            });

    } catch (e) {
        console.warn(e);
    }
}

function clearDominanceAudioTimers() {
    if (state.tensionStartTimerId) {
        clearTimeout(state.tensionStartTimerId);
        state.tensionStartTimerId = null;
    }
    if (state.tensionEndTimerId) {
        clearTimeout(state.tensionEndTimerId);
        state.tensionEndTimerId = null;
    }
}

function resetDominanceAudioState() {
    clearDominanceAudioTimers();
    state.dominanceAudioPhase = "idle";
    state.lastDominantVoiceSide = null;
    state.lastDominantVoiceAt = 0;
}

function startDominanceTension(side) {

    if (!state.audioEnabled || !state.audioUnlocked) return;

    const tension = document.getElementById("music-tension");

    if (!tension) return;

    state.dominanceAudioPhase = "tension";

    fadeAudio("music-main", 0.10, 600);

    tension.pause();
    tension.currentTime = 0;
    tension.volume = 0.06;
    tension.loop = false;

    tension.play().catch(console.warn);

    tension.onended = () => {
        fadeAudio("music-main", 0.30, 900);
        state.dominanceAudioPhase = "idle";
    };
}

function scheduleDominanceTension(side, delayMs = 5200) {

    if (state.tensionStartTimerId) {
        clearTimeout(state.tensionStartTimerId);
    }

    state.tensionStartTimerId = setTimeout(() => {
        state.tensionStartTimerId = null;
        startDominanceTension(side);
    }, delayMs);
}

function playDominanceVoice(side) {
    if (!state.audioEnabled || !state.audioUnlocked) return false;
    const now = Date.now();
    const audioSessionId = state.audioSessionId;
    if (state.lastDominantVoiceSide === side) return false;
    const id = side === "LEFT" ? "voice-green" : "voice-gray";
    const otherId = side === "LEFT" ? "voice-gray" : "voice-green";
    const el = document.getElementById(id);
    if (!el || !el.getAttribute("src")) return false;
    clearDominanceAudioTimers();
    stopSound(otherId);
    fadeAudio("music-tension", 0, 300);
    fadeAudio("music-main", 0.02, 450);
    state.dominanceAudioPhase = "voice";
    try {
        el.volume = getDefaultVolume(id);
        el.currentTime = 0;
        el.onended = () => {
            if (audioSessionId !== state.audioSessionId) return;
            startDominanceTension(side);
        };
        const playPromise = el.play();
        if (playPromise && typeof playPromise.then === "function") {
            playPromise
                .then(() => {
                    if (audioSessionId !== state.audioSessionId || !state.audioEnabled || !state.audioUnlocked) return;
                    state.lastDominantVoiceAt = now;
                    state.lastDominantVoiceSide = side;
                    const fallbackDelay = Number.isFinite(el.duration) && el.duration > 0
                        ? Math.ceil(el.duration * 1000) + 300
                        : 5200;
                    scheduleDominanceTension(side, fallbackDelay);
                })
                .catch(() => {
                    if (audioSessionId !== state.audioSessionId) return;
                    state.dominanceAudioPhase = "idle";
                    state.lastDominantVoiceSide = null;
                    state.lastDominantVoiceAt = 0;
                    fadeAudio("music-main", 0.30, 700);
                });
        } else {
            state.lastDominantVoiceAt = now;
            state.lastDominantVoiceSide = side;
            scheduleDominanceTension(side);
        }
        return true;
    } catch (e) {}
    state.dominanceAudioPhase = "idle";
    return false;
}

function getAudioContext() {
    if (!state.audioEnabled) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!state.audioContext) state.audioContext = new AudioContextClass();
    if (state.audioContext.state === "suspended") state.audioContext.resume().catch(() => {});
    return state.audioContext;
}

function playTone(frequency = 440, duration = 0.08, type = "sine", volume = 0.035) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
}

function playFallbackSound(id) {
    const now = Date.now();
    const minGap = id === "sound-button" ? 80 : 180;
    if (now - (state.soundLastPlayed[id] || 0) < minGap) return;
    state.soundLastPlayed[id] = now;
    const presets = {
        "sound-button": [520, 0.06, "triangle", 0.025],
        "sound-pull": [300, 0.05, "square", 0.02],
        "sound-win": [880, 0.16, "sine", 0.035]
    };
    const preset = presets[id];
    if (preset) playTone(...preset);
}

function playSound(id, restart = false, allowFallback = true) {
    if (!state.audioEnabled || !state.audioUnlocked) return;
    const el = document.getElementById(id);
    if (el && el.getAttribute("src")) {
        try {
            if (restart) el.currentTime = 0;
            el.play().catch((error) => {
                console.warn(`[audio] play() failed en ${id}:`, error);
                if (allowFallback) playFallbackSound(id);
            });
            return;
        } catch (e) {}
    }
    if (allowFallback) playFallbackSound(id);
}

function stopSound(id) {
    const el = document.getElementById(id);
    if (el) { el.pause(); el.currentTime = 0; }
}

function stopAllAudio() {
  state.audioEnabled = false;
  state.audioUnlocked = false;
  state.audioSessionId += 1;

  clearDominanceAudioTimers();

  Object.values(state.audioFadeTimers).forEach(timerId => {
    if (timerId) clearInterval(timerId);
  });
  state.audioFadeTimers = {};

  document.querySelectorAll("audio").forEach((el) => {
    try {
      el.pause();
      el.currentTime = 0;
      el.loop = el.id === "music-main";
      el.onended = null;
    } catch (e) {}
  });

  resetDominanceAudioState();
  syncAudioToggle();
}

function updateMusic() {
    syncAudioStateFromMain();
    if (!state.audioEnabled || !state.audioUnlocked) return;
    const leftPlayers = state.activePlayers.filter(p => p.side === "LEFT").length;
    const rightPlayers = state.activePlayers.filter(p => p.side === "RIGHT").length;
    const totalPlayers = leftPlayers + rightPlayers;
    const teamDiff = Math.abs(leftPlayers - rightPlayers);
    const dominantByPlayers = leftPlayers > rightPlayers ? "LEFT" : (rightPlayers > leftPlayers ? "RIGHT" : null);
    const tensionActive = totalPlayers >= 2 && teamDiff >= 1 && Boolean(dominantByPlayers);
    const normalMainVolume = 0.30;
    const duckedMainVolume = 0.02;
    const dominantMainVolume = 0.12;
    const tensionVolume = tensionActive ? 0.024 : 0;

    if (tensionActive) {
        if (state.lastDominantVoiceSide !== dominantByPlayers) {
            playLoop("music-main", normalMainVolume);
            playDominanceVoice(dominantByPlayers);
            return;
        }
        if (state.dominanceAudioPhase === "voice") {
            fadeAudio("music-main", duckedMainVolume, 450);
            fadeAudio("music-tension", 0, 300);
            return;
        }
        if (state.dominanceAudioPhase === "tension") {
            fadeAudio("music-main", dominantMainVolume, 900);
            playLoop("music-tension", tensionVolume);
            return;
        }
        fadeAudio("music-tension", 0, 900);
        fadeAudio("music-main", normalMainVolume, 900);
    } else {
        state.lastDominantVoiceSide = null;
        state.lastDominantVoiceAt = 0;
        state.dominanceAudioPhase = "idle";
        if (state.tensionStartTimerId) {
            clearTimeout(state.tensionStartTimerId);
            state.tensionStartTimerId = null;
        }
        if (state.tensionEndTimerId) {
            clearTimeout(state.tensionEndTimerId);
            state.tensionEndTimerId = null;
        }
        fadeAudio("music-tension", 0, 900);
        fadeAudio("music-main", normalMainVolume, 900);
    }
}

async function handleSessionChange(session) {
  state.authBootstrapVersion += 1;
  const version = state.authBootstrapVersion;
  state.session = session;
  stopPresenceLoops();
  if (!session) { state.currentPlayer = null; state.activePlayers = []; renderSignedOutState(); return; }
  setAuthBusy(true); setStatus("Recuperando perfil...", "info");
  try {
    await ensurePlayerProfile(session.user);
    if (version !== state.authBootstrapVersion) return;
    await markPresenceActive(); startPresenceLoops(); await loadGameState();
    if (version !== state.authBootstrapVersion) return;
    toggleGameUI(true); setSessionState("live", "Sesion activa");
    setStatus(`Listo para jugar, ${state.currentPlayer.alias}.`, "success");
  } catch (error) { console.error(error); setStatus("Error al restaurar sesion.", "error"); }
  finally { if (version === state.authBootstrapVersion) { setAuthBusy(false); syncAuthButtonLabel(); renderPlayerState(); } }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (state.isAuthBusy) return;

  const alias = sanitizeAlias(dom.aliasInput.value);
  const password = dom.passwordInput.value.trim();
  const syntheticEmail = `${alias.toLowerCase().replace(/\s+/g, ".")}@game.local`;

  setAuthBusy(true);

  try {

    // ACTIVAR AUDIO DESDE INTERACCIÓN DEL USUARIO
    if (!state.audioUnlocked) {
      await enableAudioFromUserGesture();
    }

    if (state.authMode === "register") {
      const { data, error } = await db.auth.signUp({
        email: syntheticEmail,
        password,
        options: { data: { alias } }
      });

      if (error) throw error;

      setStatus(`Cuenta creada para ${alias}.`, "success");

    } else {

      const { error } = await db.auth.signInWithPassword({
        email: syntheticEmail,
        password
      });

      if (error) throw error;
    }

  } catch (error) {
    setStatus(error.message, "error");
    setAuthBusy(false);
  }
}

async function handleLogout() { await markPresenceInactive(); await db.auth.signOut(); }

async function ensurePlayerProfile(user) {
  const { data: player } = await db.from("players").select("*").eq("id", user.id).maybeSingle();
  if (player) { state.currentPlayer = player; return; }
  const alias = user.user_metadata?.alias || user.email.split("@")[0];
  const { error } = await db.from("players").insert({ id: user.id, alias, is_active: true, last_seen_at: new Date().toISOString() });
  if (error) throw error;
  state.currentPlayer = (await db.from("players").select("*").eq("id", user.id).single()).data;
}

async function chooseSide(side) {
  if (!state.currentPlayer || state.isSideBusy) return;
  setSideBusy(true);
  try {
    await db.from("players").update({ side, is_active: true, last_seen_at: new Date().toISOString() }).eq("id", state.currentPlayer.id);
    state.currentPlayer.side = side; await loadGameState();
    playSound("sound-button", true);
    setStatus(`Te uniste al equipo ${side === "LEFT" ? "VERDE" : "GRIS"}.`, "success");
  } catch (e) { console.error(e); } finally { setSideBusy(false); }
}

async function loadGameState() {
  const { data: players } = await db.from("players").select("*").eq("is_active", true).gt("last_seen_at", new Date(Date.now() - PRESENCE_TIMEOUT_MS).toISOString());
  state.activePlayers = players || [];
  if (typeof renderScene === "function") renderScene(state.activePlayers, state.currentPlayer);
  renderPlayerState(); checkRecruitment();
}

function startPresenceLoops() {
  stopPresenceLoops();
  state.heartbeatTimerId = setInterval(() => markPresenceActive(), HEARTBEAT_INTERVAL_MS);
  state.refreshTimerId = setInterval(() => loadGameState(), SNAPSHOT_REFRESH_MS);
}

function stopPresenceLoops() { if (state.heartbeatTimerId) clearInterval(state.heartbeatTimerId); if (state.refreshTimerId) clearInterval(state.refreshTimerId); }

async function markPresenceActive() {
  if (!state.currentPlayer) return;
  await db.from("players").update({ is_active: true, last_seen_at: new Date().toISOString() }).eq("id", state.currentPlayer.id);
}

async function markPresenceInactive() { if (!state.currentPlayer) return; await db.from("players").update({ is_active: false }).eq("id", state.currentPlayer.id); }

function subscribeToPlayersRealtime() { db.channel("players-realtime").on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => loadGameState()).subscribe(); }

function flushPresenceOnExit() {
  if (!state.session || !state.currentPlayer) return;
  const payload = JSON.stringify({ is_active: false, last_seen_at: new Date().toISOString() });
  fetch(`${SUPABASE_URL}/rest/v1/players?id=eq.${state.currentPlayer.id}`, {
    method: "PATCH", headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${state.session.access_token}`, "Content-Type": "application/json" },
    body: payload, keepalive: true
  });
}

function handleVisibilityChange() { if (!document.hidden && state.session) { markPresenceActive(); loadGameState(); } }

function renderSignedOutState() { toggleGameUI(false); if (typeof renderScene === "function") renderScene([], null); setSessionState("idle", "Sin sesion"); }

function renderPlayerState() {
  if (typeof renderPlayerStateUI === "function") renderPlayerStateUI(state.currentPlayer);
  dom.playerAliasLabel.textContent = state.currentPlayer?.alias || "Jugador";
  if (dom.leftBtn) dom.leftBtn.dataset.active = String(state.currentPlayer?.side === "LEFT");
  if (dom.rightBtn) dom.rightBtn.dataset.active = String(state.currentPlayer?.side === "RIGHT");
}

function toggleGameUI(isVisible) {
  if (dom.authPanel) dom.authPanel.classList.toggle("hidden", isVisible);
  if (dom.gameUI) dom.gameUI.classList.toggle("hidden", !isVisible);
  if (dom.toggleHudBtn) dom.toggleHudBtn.classList.toggle("hidden", !isVisible);
}

function setAuthMode(mode) {
  state.authMode = mode;
  if (dom.loginTab) dom.loginTab.classList.toggle("active", mode === "login");
  if (dom.registerTab) dom.registerTab.classList.toggle("active", mode === "register");
  syncAuthButtonLabel();
}

function syncAuthButtonLabel() { if (dom.authSubmitBtn) dom.authSubmitBtn.textContent = state.authMode === "register" ? "Crear cuenta" : "Entrar al juego"; }

function setAuthBusy(isBusy) {
  state.isAuthBusy = isBusy;
  if (dom.aliasInput) dom.aliasInput.disabled = isBusy;
  if (dom.passwordInput) dom.passwordInput.disabled = isBusy;
  if (dom.authSubmitBtn) dom.authSubmitBtn.disabled = isBusy;
}

function setSideBusy(isBusy) {
  state.isSideBusy = isBusy;
  if (dom.leftBtn) dom.leftBtn.disabled = isBusy;
  if (dom.rightBtn) dom.rightBtn.disabled = isBusy;
}

function setStatus(message, tone) {
  if (dom.statusBanner) { dom.statusBanner.textContent = message; dom.statusBanner.className = `status-banner status-${tone}`; }
}

function setSessionState(mode, text) {
  if (dom.sessionStatusText) dom.sessionStatusText.textContent = text;
  if (dom.sessionIndicator) dom.sessionIndicator.className = "session-dot " + mode;
}

function sanitizeAlias(rawAlias) { return rawAlias.trim().replace(/\s+/g, " "); }

function handleUnexpectedError(error) { console.error(error); setStatus("Error inesperado.", "error"); }
window.addEventListener("beforeunload", stopAllAudio);

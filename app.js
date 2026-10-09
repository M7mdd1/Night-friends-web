document.addEventListener("DOMContentLoaded", () => {
  const $ = (selector) => document.querySelector(selector);
  const categories = ["أعلام العالم", "معلومات عامة", "سرعة البديهة", "التمثيل", "التحديات"];
  const defaultTeamNames = ["الفريق الأول", "الفريق الثاني", "الفريق الثالث", "الفريق الرابع", "الفريق الخامس"];
  const faces = ["🧑🏻", "🧑🏽", "🧑🏼", "🧑🏾", "🧑🏼‍🦱", "👩🏻", "👩🏽", "👩🏼"];

  let socket = null;
  try {
    if (typeof io !== "undefined") {
      socket = io();
    }
  } catch (e) {
    console.error("Socket init error:", e);
  }

  let teams = [];
  let currentState = null;
  let currentRole = "host";
  let currentSession = null;
  let wheelRotation = 0;
  let lastSpinId = 0;
  let toastTimeout;
  let muted = false;

  function toast(message) {
    const node = $("#toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => node.classList.remove("show"), 2500);
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function show(viewId) {
    ["homeView", "setupView", "gameView", "joinView"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        if (id === viewId) {
          el.classList.remove("hidden");
          el.style.display = "block";
        } else {
          el.classList.add("hidden");
          el.style.display = "none";
        }
      }
    });
  }

  // إظهار الصفحة الرئيسية أولاً بقوة
  show("homeView");

  function showJoinMessage(message, isError = true) {
    const element = $("#joinMessage");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("error", isError);
    element.classList.toggle("success", !isError);
  }

  function setConnection(message, connected) {
    const element = $("#connectionStatus");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("connected", connected);
    element.classList.toggle("disconnected", !connected);
  }

  function setupTeams() {
    const teamCountEl = $("#teamCount");
    if (!teamCountEl) return;
    const count = Number(teamCountEl.value);
    const oldTeams = teams;
    teams = Array.from({ length: count }, (_, index) => oldTeams[index] || ({
      name: defaultTeamNames[index] || `الفريق ${index + 1}`,
    }));
    const editor = $("#teamEditor");
    if (editor) {
      editor.innerHTML = teams.map((team, index) => `
        <div class="team-edit">
          <span class="avatar team-avatar-${index % 8}">${faces[index % faces.length]}</span>
          <input aria-label="اسم الفريق ${index + 1}" data-team="${index}" value="${esc(team.name)}" maxlength="24">
        </div>
      `).join("");
    }
  }

  function renderScores(state) {
    const activeTeam = state.teams.length ? state.questionIndex % state.teams.length : -1;
    const sorted = state.teams.map((team, index) => ({ ...team, index }))
      .sort((first, second) => second.score - first.score);
    const scoreboard = $("#scoreboard");
    if (scoreboard) {
      scoreboard.innerHTML = sorted.map((team, rank) => `
        <div class="score-item ${team.index === activeTeam ? "active" : ""}">
          <span class="avatar" style="background:${team.color}25;color:${team.color}">${team.face}</span>
          <div class="score-name"><b>${esc(team.name)}</b>
            <small>${rank === 0 && team.score > 0 ? "متصدر الترتيب" : `الفريق ${team.index + 1}`}</small>
          </div>
          <span class="score-num">${team.score}</span>
        </div>
      `).join("");
    }
  }

  function renderPlayers(state) {
    const playerCount = $("#playerCount");
    const playersList = $("#playersList");
    if (playerCount) playerCount.textContent = String(state.players.length);
    if (playersList) {
      playersList.innerHTML = state.players.map((player) => `
        <div class="player-chip">
          <span class="online-dot ${player.online ? "" : "offline"}"></span>
          <span class="player-name">${esc(player.name)}</span>
          <small>${player.role === "host" ? "المضيف" : "لاعب"}</small>
        </div>
      `).join("");
    }
  }

  function animateWheel(state) {
    if (!state.spinId || state.spinId === lastSpinId) return;
    lastSpinId = state.spinId;
    const categoryIndex = categories.indexOf(state.spinTarget || state.category);
    if (categoryIndex < 0) return;

    const middleOfSlice = categoryIndex * 72 + 36;
    const targetRemainder = (360 - middleOfSlice) % 360;
    const destination = Math.ceil((wheelRotation + 1440 - targetRemainder) / 360) * 360 + targetRemainder;
    wheelRotation = destination;
    const wheel = $("#wheel");
    const spinBtn = $("#spinBtn");
    if (wheel) wheel.style.transform = `rotate(${destination}deg)`;
    if (spinBtn) spinBtn.disabled = true;
    setTimeout(() => { if (spinBtn) spinBtn.disabled = false; }, 3300);
    toast(`الفئة المختارة: ${state.category}`);
  }

  function renderState(state) {
    if (!state || (currentSession && state.code !== currentSession.code)) return;
    const firstSnapshot = !currentState;
    const previousQuestionId = currentState?.question?.id;
    if (firstSnapshot) lastSpinId = Number(state.spinId) || 0;
    currentState = state;
    show("gameView");

    const roomLabel = $("#roomLabel");
    const roomCode = $("#roomCode");
    const roundTitle = $("#roundTitle");
    const roundCount = $("#roundCount");
    const questionNo = $("#questionNo");
    const category = $("#category");
    const flag = $("#flag");
    const question = $("#question");
    const answerText = $("#answerText");
    const answerBox = $("#answerBox");
    const answerInput = $("#answerInput");

    if (roomLabel) roomLabel.textContent = state.roomName;
    if (roomCode) roomCode.textContent = state.code;
    if (roundTitle) roundTitle.textContent = state.round === 1 ? "الجولة الأولى" : state.round === 2 ? "الجولة الثانية" : `الجولة ${state.round}`;
    if (roundCount) roundCount.textContent = `الجولة ${state.round}`;
    if (questionNo) questionNo.textContent = `التحدي ${state.questionIndex + 1}`;
    if (category) category.textContent = state.category;
    if (flag) flag.textContent = state.question?.icon || "✨";
    if (question) question.textContent = state.question?.prompt || "بانتظار التحدّي التالي";
    if (answerText) answerText.textContent = state.question?.answer || "الإجابة متاحة للمضيف";

    if (previousQuestionId !== state.question?.id && answerBox && answerInput) {
      answerBox.classList.add("hidden");
      answerInput.value = "";
    }

    const isHost = currentRole === "host";
    document.querySelectorAll("[data-host-only]").forEach((element) => {
      element.classList.toggle("hidden", !isHost);
    });
    const guestHint = $("#guestHint");
    if (guestHint) guestHint.classList.toggle("hidden", isHost);
    if (!isHost && answerBox) answerBox.classList.add("hidden");

    const timerBtn = $("#timerBtn");
    const timer = $("#timer");
    const timerBar = $("#timerBar");
    const wheelResult = $("#wheelResult");

    if (timerBtn) timerBtn.textContent = state.timerRunning ? "إيقاف المؤقت" : "ابدأ المؤقت";
    if (timer) timer.textContent = String(state.timeRemaining);
    const progress = state.timeLimit ? Math.min(100, (state.timeRemaining / state.timeLimit) * 100) : 0;
    if (timerBar) timerBar.style.width = `${progress}%`;
    if (wheelResult) {
      wheelResult.textContent = state.spinTarget
        ? `الفئة المختارة: ${state.category}`
        : "لفّ العجلة لاختيار الفئة التالية";
    }
    renderScores(state);
    renderPlayers(state);
    animateWheel(state);
    if (socket) {
      setConnection(socket.connected ? (isHost ? "متصل · المضيف" : "متصل · لاعب") : "انقطع الاتصال", socket.connected);
    }
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem("shutabeem-session") || "null");
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    currentSession = session;
    currentRole = session.role;
    localStorage.setItem("shutabeem-session", JSON.stringify(session));
  }

  function clearSession() {
    currentSession = null;
    currentRole = null;
    localStorage.removeItem("shutabeem-session");
  }

  function emitAck(eventName, payload) {
    return new Promise((resolve) => {
      if (!socket || !socket.connected) {
        resolve({ ok: false, error: "لا يوجد اتصال بالخادم. تحقّق من الإنترنت." });
        return;
      }
      const timeout = setTimeout(() => resolve({ ok: false, error: "انتهت مهلة الاتصال بالخادم." }), 12000);
      socket.emit(eventName, payload, (result) => {
        clearTimeout(timeout);
        resolve(result || { ok: false, error: "استجابة غير صالحة من الخادم." });
      });
    });
  }

  async function runHostAction(action) {
    if (currentRole !== "host") {
      toast("هذا الإجراء متاح للمضيف فقط.");
      return null;
    }
    const result = await emitAck("host:action", { action });
    if (!result.ok) {
      toast(result.error || "تعذّر تنفيذ الإجراء.");
      return null;
    }
    renderState(result.state);
    return result.state;
  }

  function makeRoomLink(code) {
    const url = new URL(window.location.href);
    url.searchParams.set("room", code);
    return url.toString();
  }

  // ربط الأزرار الأساسية
  const startBtn = $("#startBtn");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      setupTeams();
      show("setupView");
    });
  }

  const teamCount = $("#teamCount");
  if (teamCount) teamCount.addEventListener("change", setupTeams);
  setupTeams();

  const saveSetup = $("#saveSetup");
  if (saveSetup) {
    saveSetup.addEventListener("click", () => {
      const playerNameInput = $("#playerName");
      const roomNameInput = $("#roomName");
      const roundTimeInput = $("#roundTime");

      const playerName = playerNameInput ? playerNameInput.value.trim() : "المضيف";
      const roomName = roomNameInput ? roomNameInput.value.trim() : "غرفة اللعب";

      const teamNames = teams.map((_, index) => {
        const input = document.querySelector(`[data-team="${index}"]`);
        return input?.value.trim() || defaultTeamNames[index] || `الفريق ${index + 1}`;
      });

      saveSetup.disabled = true;
      saveSetup.textContent = "جارٍ إنشاء الغرفة...";

      if (socket && socket.connected) {
        socket.emit("room:create", {
          playerName,
          roomName,
          teams: teamNames,
          timeLimit: roundTimeInput ? Number(roundTimeInput.value) : 45,
        }, (result) => {
          saveSetup.disabled = false;
          saveSetup.textContent = "حفظ وبدء الجولة ←";

          if (result && result.ok) {
            saveSession({ code: result.code, role: "host", token: result.hostToken });
            renderState(result.state);
            toast(`تم إنشاء الغرفة ${result.code}`);
          } else {
            show("gameView");
            toast("تم البدء بنجاح!");
          }
        });
      } else {
        saveSetup.disabled = false;
        saveSetup.textContent = "حفظ وبدء الجولة ←";
        show("gameView");
        toast("تم البدء محلياً!");
      }

      setTimeout(() => {
        if (saveSetup.disabled) {
          saveSetup.disabled = false;
          saveSetup.textContent = "حفظ وبدء الجولة ←";
          show("gameView");
        }
      }, 2500);
    });
  }

  const joinBtn = $("#joinBtn");
  if (joinBtn) joinBtn.addEventListener("click", () => show("joinView"));

  const backHome = $("#backHome");
  if (backHome) {
    backHome.addEventListener("click", () => {
      show("homeView");
      showJoinMessage("");
    });
  }

  const joinConfirm = $("#joinConfirm");
  if (joinConfirm) {
    joinConfirm.addEventListener("click", async () => {
      const joinCodeInput = $("#joinCode");
      const joinPlayerNameInput = $("#joinPlayerName");
      const code = joinCodeInput ? joinCodeInput.value.trim().toUpperCase() : "";
      const playerName = joinPlayerNameInput ? joinPlayerNameInput.value.trim() : "";

      if (!playerName) {
        showJoinMessage("اكتب اسم اللاعب للمتابعة.");
        if (joinPlayerNameInput) joinPlayerNameInput.focus();
        return;
      }
      if (!code) {
        showJoinMessage("اكتب رمز الغرفة أولًا.");
        if (joinCodeInput) joinCodeInput.focus();
        return;
      }

      joinConfirm.disabled = true;
      showJoinMessage("جارٍ التحقق من الغرفة...", false);

      const result = await emitAck("room:join", { code, playerName });

      joinConfirm.disabled = false;

      if (!result.ok) {
        showJoinMessage(result.error || "تعذّر الانضمام.");
        return;
      }
      saveSession({ code: result.state.code, role: "player", token: result.playerToken });
      renderState(result.state);
      showJoinMessage("تم الانضمام إلى الغرفة.", false);
    });
  }

  const joinCodeEl = $("#joinCode");
  if (joinCodeEl) {
    joinCodeEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && joinConfirm) joinConfirm.click();
    });
  }

  const timerBtn = $("#timerBtn");
  if (timerBtn) timerBtn.addEventListener("click", () => runHostAction("timer"));

  const revealBtn = $("#revealBtn");
  if (revealBtn) {
    revealBtn.addEventListener("click", () => {
      if (currentRole === "host") {
        const answerBox = $("#answerBox");
        if (answerBox) answerBox.classList.remove("hidden");
      }
    });
  }

  const correctBtn = $("#correctBtn");
  if (correctBtn) {
    correctBtn.addEventListener("click", async () => {
      const state = await runHostAction("correct");
      if (state) toast("تمت إضافة 10 نقاط للفريق النشط.");
    });
  }

  const wrongBtn = $("#wrongBtn");
  if (wrongBtn) {
    wrongBtn.addEventListener("click", async () => {
      const state = await runHostAction("wrong");
      if (state) toast("ولا يهمكم، جرّبوا التحدّي التالي.");
    });
  }

  const nextBtn = $("#nextBtn");
  if (nextBtn) nextBtn.addEventListener("click", () => runHostAction("next"));

  const endRoundBtn = $("#endRoundBtn");
  if (endRoundBtn) {
    endRoundBtn.addEventListener("click", async () => {
      const state = await runHostAction("endRound");
      if (state) toast(`بدأت الجولة ${state.round}.`);
    });
  }

  const resetBtn = $("#resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (confirm("متأكد تبي تصفّر النقاط والجولة للجميع؟")) runHostAction("reset");
    });
  }

  const addTeamBtn = $("#addTeamBtn");
  if (addTeamBtn) {
    addTeamBtn.addEventListener("click", async () => {
      const state = await runHostAction("addTeam");
      if (state) toast("تمت إضافة فريق.");
    });
  }

  const spinBtn = $("#spinBtn");
  if (spinBtn) spinBtn.addEventListener("click", () => runHostAction("spin"));

  const copyCode = $("#copyCode");
  if (copyCode) {
    copyCode.addEventListener("click", async () => {
      if (!currentState?.code) return;
      const link = makeRoomLink(currentState.code);
      try {
        await navigator.clipboard.writeText(link);
        toast("تم نسخ رابط الانضمام.");
      } catch {
        toast(link);
      }
    });
  }

  const themeBtn = $("#themeBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      document.body.classList.toggle("light");
      localStorage.setItem("shutabeem-theme", document.body.classList.contains("light") ? "light" : "dark");
    });
  }
  if (localStorage.getItem("shutabeem-theme") === "light") document.body.classList.add("light");

  const soundBtn = $("#soundBtn");
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      muted = !muted;
      soundBtn.textContent = muted ? "🔇" : "🔊";
      toast(muted ? "تم إيقاف الصوت" : "تم تفعيل الصوت");
    });
  }

  if (socket) {
    socket.on("connect", async () => {
      setConnection("متصل بالخادم", true);
      const linkedCode = new URLSearchParams(location.search).get("room")?.toUpperCase();
      const session = currentSession || getSession();
      if (session?.code && session?.token && (!linkedCode || linkedCode === session.code)) {
        currentSession = session;
        currentRole = session.role;
        const result = await emitAck("room:resume", { code: session.code, token: session.token });
        if (result.ok) {
          renderState(result.state);
          return;
        }
        clearSession();
        if (new URLSearchParams(location.search).has("room")) show("joinView");
        toast(result.error || "انتهت الجلسة.");
      }

      if (linkedCode) {
        if (currentSession?.code !== linkedCode) {
          currentSession = null;
          currentRole = null;
        }
        const joinCodeField = $("#joinCode");
        if (joinCodeField) joinCodeField.value = linkedCode.toUpperCase();
        show("joinView");
      }
    });

    socket.on("disconnect", () => setConnection("انقطع الاتصال · جارٍ إعادة المحاولة", false));
    socket.on("connect_error", () => setConnection("تعذّر الاتصال بالخادم", false));
    socket.on("room:state", (state) => {
      if (currentSession && state.code === currentSession.code) renderState(state);
    });
  }

  setInterval(() => {
    if (!currentState) return;
    const remaining = currentState.timerRunning && currentState.timerEndsAt
      ? Math.max(0, Math.ceil((currentState.timerEndsAt - Date.now()) / 1000))
      : currentState.timeRemaining;
    const timerEl = $("#timer");
    const timerBarEl = $("#timerBar");
    if (timerEl) timerEl.textContent = String(remaining);
    const progress = currentState.timeLimit ? Math.min(100, (remaining / currentState.timeLimit) * 100) : 0;
    if (timerBarEl) timerBarEl.style.width = `${progress}%`;
  }, 250);
});

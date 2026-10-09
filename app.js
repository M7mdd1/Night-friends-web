document.addEventListener("DOMContentLoaded", () => {
  const $ = (selector) => document.querySelector(selector);   const $$ = (selector) => document.querySelectorAll(selector);

  let socket = null;
  try { if (typeof io !== "undefined") socket = io(); } catch (e) {}

  let currentState = null;
  let currentRole = "host";

  function toast(msg) {
    const n = $("#toast");
    if (!n) return;
    n.textContent = msg;
    n.classList.add("show");
    setTimeout(() => n.classList.remove("show"), 2500);
  }

  function showView(viewId) {
    ["homeView", "setupView", "gameView", "joinView"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = (id === viewId) ? (id === "gameView" ? "grid" : "block") : "none";
    });
  }

  showView("homeView");

  // التنقل بين الشاشات الرئيسية
  $("#startBtn")?.addEventListener("click", () => showView("setupView"));
  $("#joinBtn")?.addEventListener("click", () => showView("joinView"));
  $("#backHome")?.addEventListener("click", () => showView("homeView"));

  function renderState(state) {
    if (!state) return;
    currentState = state;
    showView("gameView");

    // إخفاء كود الغرفة تماماً عن اللاعبين ومنع نسخه
    const roomCodeContainer = document.querySelector(".room-code");
    if (roomCodeContainer) {
      roomCodeContainer.style.display = (currentRole === "host") ? "block" : "none";
    }

    const roomCodeEl = $("#roomCode");     if (roomCodeEl) roomCodeEl.textContent = state.code;      // تفعيل وإظهار عناصر المضيف فقط     $$(".host-only").forEach(el => {
      el.style.display = (currentRole === "host") ? (el.tagName === "BUTTON" ? "inline-block" : "block") : "none";
    });

    // إدارة ظهور الروليت أو شاشة الأسئلة بناءً على حالة العجلة
    const wheelPanel = document.querySelector(".wheel-panel");
    const challengeCard = document.querySelector(".challenge-card");
    if (wheelPanel && challengeCard) {
      if (state.showWheel) {
        wheelPanel.style.display = "block";
        challengeCard.style.display = "none";
      } else {
        wheelPanel.style.display = "none";
        challengeCard.style.display = "block";
      }
    }

    // تحديث بيانات السؤال
    const categoryEl = $("#category");
    const promptEl = $("#question");
    const flagEl = $("#flag");
    const answerTextEl = $("#answerText");
    const roundTitleEl = $("#roundTitle");
    const roundCountEl = $("#roundCount");

    if (categoryEl) categoryEl.textContent = state.category;
    if (promptEl) promptEl.textContent = state.question?.prompt || "انتظر السؤال...";
    if (flagEl) flagEl.textContent = state.question?.icon || "✨";
    if (answerTextEl) answerTextEl.textContent = state.question?.answer || "الإجابة مخفية";
    if (roundTitleEl) roundTitleEl.textContent = `الجولة ${state.round}`;
    if (roundCountEl) roundCountEl.textContent = `الجولة ${state.round}`;

    // لوحة الفرق وتوقيتاتهم (نظام الوقت بدل النقاط)
    const scoreboard = $("#scoreboard");
    if (scoreboard) {
      scoreboard.innerHTML = state.teams.map((team, idx) => `
        <div class="score-item ${idx === state.activeTeamIndex ? 'active' : ''}" style="border-right: 4px solid ${team.color}; padding: 8px; margin-bottom: 6px; background: rgba(255,255,255,0.03); border-radius: 6px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>${team.face}</span>
            <div><b>${team.name}</b><br><small style="color: ${idx === state.activeTeamIndex ? '#47e0a1' : '#94a3b8'}">${idx === state.activeTeamIndex ? 'دور الفريق الحالي 🎯' : ''}</small></div>
          </div>
          <span style="color: #ff5252; font-weight: bold;">⏱️ ${team.timeRemaining}ث</span>
        </div>
      `).join("");
    }
  }

  // تفاعل المضيف مع الأزرار
  $("#correctBtn")?.addEventListener("click", () => {
    socket.emit("host:action", { action: "correct" }, (res) => { if(res.ok) renderState(res.state); });
  });

  $("#wrongBtn")?.addEventListener("click", () => {
    socket.emit("host:action", { action: "wrong" }, (res) => { if(res.ok) renderState(res.state); });
  });

  $("#revealBtn")?.addEventListener("click", () => {
    const box = $("#answerBox");
    if (box) box.classList.toggle("hidden");
  });

  // لف العجلة أو اختيار الفئات
  $("#spinBtn")?.addEventListener("click", () => {
    socket.emit("host:action", { action: "spin" }, (res) => { if(res.ok) renderState(res.state); });
  });

  $("#nextBtn")?.addEventListener("click", () => {
    socket.emit("host:action", { action: "nextCategory" }, (res) => { if(res.ok) renderState(res.state); });
  });

  // إنشاء الغرفة من الإعدادات
  $("#saveSetup")?.addEventListener("click", () => {
    currentRole = "host";
    const playerName = $("#playerName")?.value || "المضيف";
    const roomName = $("#roomName")?.value || "جمعة الأصدقاء";
    const timeLimit = Number($("#roundTime")?.value) || 45;
    const teamCount = Number($("#teamCount")?.value) || 3;

    const teams = [];
    for(let i=1; i<=teamCount; i++) teams.push(`الفريق ${i}`);

    socket.emit("room:create", { playerName, roomName, timeLimit, teams }, (res) => {
      if (res.ok) {
        localStorage.setItem("shutabeem-session", JSON.stringify({ code: res.code, role: "host", token: res.hostToken }));
        renderState(res.state);
      } else {
        toast(res.error || "تعذّر إنشاء الغرفة");
      }
    });
  });

  // انضمام اللاعبين
  $("#joinConfirm")?.addEventListener("click", () => {
    currentRole = "player";
    const code = $("#joinCode")?.value;
    const playerName = $("#joinPlayerName")?.value || "لاعب";

    socket.emit("room:join", { code, playerName }, (res) => {
      if (res.ok) {
        localStorage.setItem("shutabeem-session", JSON.stringify({ code: res.state.code, role: "player", token: res.playerToken }));
        renderState(res.state);
      } else {
        toast(res.error || "رمز الغرفة غير صحيح");
      }
    });
  });

  if (socket) {
    socket.on("room:state", (state) => renderState(state));
  }
});

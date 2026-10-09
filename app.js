document.addEventListener("DOMContentLoaded", () => {
  const $ = (selector) => document.querySelector(selector);   const $$ = (selector) => document.querySelectorAll(selector);

  let socket = null;
  try {
    if (typeof io !== "undefined") socket = io();
  } catch (e) {}

  let currentState = null;
  let currentRole = "host"; // افتراضياً مضيف أو حسب الجلسة

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

    // [الإضافة المطلوبة]: إخفاء كود الغرفة تماماً عن اللاعبين ومنع نسخه، وإظهاره للمضيف فقط
    const roomCodeContainer = document.querySelector(".room-code");
    if (roomCodeContainer) {
      roomCodeContainer.style.display = (currentRole === "host") ? "block" : "none";
    }

    const roomCodeEl = $("#roomCode");     if (roomCodeEl) roomCodeEl.textContent = state.code;      // تفعيل وإظهار عناصر المضيف فقط     $$(".host-only").forEach(el => {
      el.style.display = (currentRole === "host") ? (el.tagName === "BUTTON" ? "inline-block" : "block") : "none";
    });

    // تحديث بيانات السؤال واللعبة
    const categoryEl = $("#category");
    const promptEl = $("#question");
    const flagEl = $("#flag");
    const answerTextEl = $("#answerText");
    const roundTitleEl = $("#roundTitle");
    const roundCountEl = $("#roundCount");
    const timerEl = $("#timer");

    if (categoryEl) categoryEl.textContent = state.category;
    if (promptEl) promptEl.textContent = state.question?.prompt || "انتظر السؤال...";
    if (flagEl) flagEl.textContent = state.question?.icon || "✨";
    if (answerTextEl) answerTextEl.textContent = state.question?.answer || "الإجابة مخفية";
    if (roundTitleEl) roundTitleEl.textContent = `الجولة ${state.round}`;
    if (roundCountEl) roundCountEl.textContent = `الجولة ${state.round}`;
    if (timerEl) timerEl.textContent = state.timeRemaining;

    // لوحة النقاط والفرق
    const scoreboard = $("#scoreboard");
    if (scoreboard && state.teams) {
      scoreboard.innerHTML = state.teams.map((team, idx) => `
        <div class="score-item" style="border-right: 4px solid ${team.color}; padding: 8px; margin-bottom: 6px; background: rgba(255,255,255,0.03); border-radius: 6px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>${team.face}</span>
            <div><b>${team.name}</b></div>
          </div>
          <span style="color: #47e0a1; font-weight: bold;">⭐ ${team.score}</span>
        </div>
      `).join("");
    }
  }

  // أزرار تحكم المضيف
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

  $("#nextBtn")?.addEventListener("click", () => {
    socket.emit("host:action", { action: "next" }, (res) => { if(res.ok) renderState(res.state); });
  });

  $("#spinBtn")?.addEventListener("click", () => {
    socket.emit("host:action", { action: "spin" }, (res) => { if(res.ok) renderState(res.state); });
  });

  $("#timerBtn")?.addEventListener("click", () => {
    socket.emit("host:action", { action: "timer" }, (res) => { if(res.ok) renderState(res.state); });
  });

  $("#resetBtn")?.addEventListener("click", () => {
    socket.emit("host:action", { action: "reset" }, (res) => { if(res.ok) renderState(res.state); });
  });

  $("#endRoundBtn")?.addEventListener("click", () => {
    socket.emit("host:action", { action: "endRound" }, (res) => { if(res.ok) renderState(res.state); });
  });

  $("#addTeamBtn")?.addEventListener("click", () => {
    socket.emit("host:action", { action: "addTeam" }, (res) => { if(res.ok) renderState(res.state); });
  });

  // إنشاء الغرفة
  $("#saveSetup")?.addEventListener("click", () => {
    currentRole = "host";
    const playerName = $("#playerName")?.value || "المضيف";
    const roomName = $("#roomName")?.value || "تحدي الأصدقاء";
    const timeLimit = Number($("#roundTime")?.value) || 45;
    const teamCount = Number($("#teamCount")?.value) || 3;

    const teams = [];
    for(let i = 1; i <= teamCount; i++) {
      teams.push(`الفريق ${i}`);
    }

    socket.emit("room:create", { playerName, roomName, timeLimit, teams }, (res) => {
      if (res.ok) {
        localStorage.setItem("shutabeem-session", JSON.stringify({ code: res.code, role: "host", token: res.hostToken }));
        renderState(res.state);
      } else {
        toast(res.error || "تعذّر إنشاء الغرفة");
      }
    });
  });

  // انضمام اللاعب
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

  // نسخ كود الغرفة (للمضيف فقط)
  $("#copyCode")?.addEventListener("click", () => {
    const code = $("#roomCode")?.textContent;
    if (code) {
      navigator.clipboard.writeText(code);
      toast("تم نسخ رمز الغرفة!");
    }
  });

  if (socket) {
    socket.on("room:state", (state) => renderState(state));
  }
});

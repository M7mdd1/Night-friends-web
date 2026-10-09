document.addEventListener("DOMContentLoaded", () => {
  const $ = (selector) => document.querySelector(selector);
  let socket = null;
  try { if (typeof io !== "undefined") socket = io(); } catch (e) {}

  let currentState = null;
  let currentRole = "host";
  let currentSession = null;

  function toast(msg) {
    const n = $("#toast");
    if (!n) return;
    n.textContent = msg;
    n.classList.add("show");
    setTimeout(() => n.classList.remove("show"), 2500);
  }

  function show(viewId) {
    ["homeView", "setupView", "gameView", "joinView"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = (id === viewId) ? "block" : "none";
    });
  }

  show("homeView");

  function renderState(state) {
    if (!state) return;
    currentState = state;
    show("gameView");

    // إخفاء كود الغرفة وزر النسخ تماماً عن اللاعبين العاديين
    const codeArea = $("#roomCodeArea");
    if (codeArea) {
      codeArea.style.display = (currentRole === "host") ? "block" : "none";
    }

    // إدارة ظهور الروليت أو شاشة السؤال بناءً على طلب المضيف
    const wheelSection = $("#wheelSection");
    const activeGameSection = $("#activeGameSection");
    if (wheelSection && activeGameSection) {
      if (state.showWheel) {
        wheelSection.style.display = "block";
        activeGameSection.style.display = "none";
      } else {
        wheelSection.style.display = "none";
        activeGameSection.style.display = "block";
      }
    }

    // عرض بيانات السؤال الحالي
    const categoryEl = $("#category");
    const promptEl = $("#question");
    const iconEl = $("#flag");
    const answerEl = $("#answerText");

    if (categoryEl) categoryEl.textContent = state.category;
    if (promptEl) promptEl.textContent = state.question?.prompt || "بانتظار السؤال...";
    if (iconEl) iconEl.textContent = state.question?.icon || "✨";
    if (answerEl) answerEl.textContent = state.question?.answer || "الإجابة مخفية";

    // عرض أزمنة الفرق وتحديد الفريق الحالي
    const scoreboard = $("#scoreboard");
    if (scoreboard) {
      scoreboard.innerHTML = state.teams.map((team, idx) => `
        <div class="score-item ${idx === state.activeTeamIndex ? 'active' : ''}" style="border-right: 5px solid ${team.color}">
          <span class="avatar">${team.face}</span>
          <div class="score-name"><b>${team.name}</b>
            <small>${idx === state.activeTeamIndex ? 'دور الفريق الحالي 🎯' : ''}</small>
          </div>
          <span class="score-num" style="color: #ff5252;">⏱️ ${team.timeRemaining} ث</span>
        </div>
      `).join("");
    }

    // التحكم بصلاحيات المضيف
    document.querySelectorAll("[data-host-only]").forEach(el => {
      el.style.display = (currentRole === "host") ? "block" : "none";
    });
  }

  // أزرار اختيار الفئات من الروليت للمضيف
  document.querySelectorAll(".category-select-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-category");
      socket.emit("host:action", { action: "setCategory", value: cat }, (res) => {
        if (res.ok) renderState(res.state);
      });
    });
  });

  const correctBtn = $("#correctBtn");
  if (correctBtn) {
    correctBtn.addEventListener("click", () => {
      socket.emit("host:action", { action: "correct" }, (res) => { if(res.ok) renderState(res.state); });
    });
  }

  const wrongBtn = $("#wrongBtn");
  if (wrongBtn) {
    wrongBtn.addEventListener("click", () => {
      socket.emit("host:action", { action: "wrong" }, (res) => { if(res.ok) renderState(res.state); });
    });
  }

  const toggleWheelBtn = $("#toggleWheelBtn");
  if (toggleWheelBtn) {
    toggleWheelBtn.addEventListener("click", () => {
      socket.emit("host:action", { action: "toggleWheel" }, (res) => { if(res.ok) renderState(res.state); });
    });
  }

  // الانشاء والانضمام
  const saveSetup = $("#saveSetup");
  if (saveSetup) {
    saveSetup.addEventListener("click", () => {
      currentRole = "host";
      socket.emit("room:create", {
        playerName: $("#playerName")?.value || "المضيف",
        roomName: $("#roomName")?.value || "تحدي الأصدقاء",
        timeLimit: 60
      }, (res) => {
        if (res.ok) {
          localStorage.setItem("shutabeem-session", JSON.stringify({ code: res.code, role: "host", token: res.hostToken }));
          renderState(res.state);
        }
      });
    });
  }

  const joinConfirm = $("#joinConfirm");
  if (joinConfirm) {
    joinConfirm.addEventListener("click", () => {
      currentRole = "player";
      socket.emit("room:join", {
        code: $("#joinCode")?.value,
        playerName: $("#joinPlayerName")?.value || "لاعب"
      }, (res) => {
        if (res.ok) {
          localStorage.setItem("shutabeem-session", JSON.stringify({ code: res.state.code, role: "player", token: res.playerToken }));
          renderState(res.state);
        } else {
          toast(res.error);
        }
      });
    });
  }

  if (socket) {
    socket.on("room:state", (state) => renderState(state));
  }
});

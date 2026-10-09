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

  function setupTeams() {
    const teamCountEl = $("#teamCount");
    const count = teamCountEl ? Number(teamCountEl.value) : 5;
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

  // ربط أزرار التنقل بشكل مباشر ومضمون
  const startBtn = $("#startBtn");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      setupTeams();
      show("setupView");
    });
  }

  const joinBtn = $("#joinBtn");
  if (joinBtn) {
    joinBtn.addEventListener("click", () => {
      show("joinView");
    });
  }

  const backHome = $("#backHome");
  if (backHome) {
    backHome.addEventListener("click", () => {
      show("homeView");
    });
  }

  const teamCount = $("#teamCount");
  if (teamCount) {
    teamCount.addEventListener("change", setupTeams);
  }
  setupTeams();

  const saveSetup = $("#saveSetup");
  if (saveSetup) {
    saveSetup.addEventListener("click", () => {
      currentRole = "host";
      show("gameView");
      toast("تم البدء بنجاح!");
    });
  }

  const joinConfirm = $("#joinConfirm");
  if (joinConfirm) {
    joinConfirm.addEventListener("click", () => {
      const playerNameInput = $("#joinPlayerName");
      const codeInput = $("#joinCode");
      if (playerNameInput && !playerNameInput.value.trim()) {
        toast("اكتب اسم اللاعب أولاً");
        return;
      }
      currentRole = "player";
      show("gameView");
      toast("تم انضمامك للغرفة!");
    });
  }

  const themeBtn = $("#themeBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      document.body.classList.toggle("light");
    });
  }

  const soundBtn = $("#soundBtn");
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      muted = !muted;
      soundBtn.textContent = muted ? "🔇" : "🔊";
      toast(muted ? "تم إيقاف الصوت" : "تم تفعيل الصوت");
    });
  }
});

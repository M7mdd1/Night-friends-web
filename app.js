const $ = (selector) => document.querySelector(selector);
const categories = ["أعلام العالم", "معلومات عامة", "سرعة البديهة", "التمثيل", "التحديات"];
const defaultTeamNames = ["الفريق الأول", "الفريق الثاني", "الفريق الثالث", "الفريق الرابع", "الفريق الخامس"];
const faces = ["🧑🏻", "🧑🏽", "🧑🏼", "🧑🏾", "🧑🏼‍🦱", "👩🏻", "👩🏽", "👩🏼"];
const socket = window.io(window.location.origin, { transports: ["websocket", "polling"] });


let teams = [];
let currentState = null;
let currentRole = null;
let currentSession = null;
let wheelRotation = 0;
let lastSpinId = 0;
let toastTimeout;
let muted = false;

function toast(message) {
  const node = $("#toast");
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

function show(view) {
  ["homeView", "setupView", "gameView", "joinView"].forEach((id) => {
    $(`#${id}`).classList.toggle("hidden", id !== view);
  });
}

function showJoinMessage(message, isError = true) {
  const element = $("#joinMessage");
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.toggle("success", !isError);
}

function setConnection(message, connected) {
  const element = $("#connectionStatus");
  element.textContent = message;
  element.classList.toggle("connected", connected);
  element.classList.toggle("disconnected", !connected);
}

function setupTeams() {
  const count = Number($("#teamCount").value);
  const oldTeams = teams;
  teams = Array.from({ length: count }, (_, index) => oldTeams[index] || ({
    name: defaultTeamNames[index] || `الفريق ${index + 1}`,
  }));
  $("#teamEditor").innerHTML = teams.map((team, index) => `
    <div class="team-edit">
      <span class="avatar team-avatar-${index % 8}">${faces[index % faces.length]}</span>
      <input aria-label="اسم الفريق ${index + 1}" data-team="${index}" value="${esc(team.name)}" maxlength="24">
    </div>
  `).join("");
}

function renderScores(state) {
  const activeTeam = state.teams.length ? state.questionIndex % state.teams.length : -1;
  const sorted = state.teams.map((team, index) => ({ ...team, index }))
    .sort((first, second) => second.score - first.score);
  $("#scoreboard").innerHTML = sorted.map((team, rank) => `
    <div class="score-item ${team.index === activeTeam ? "active" : ""}">
      <span class="avatar" style="background:${team.color}25;color:${team.color}">${team.face}</span>
      <div class="score-name"><b>${esc(team.name)}</b>
        <small>${rank === 0 && team.score > 0 ? "متصدر الترتيب" : `الفريق ${team.index + 1}`}</small>
      </div>
      <span class="score-num">${team.score}</span>
    </div>
  `).join("");
}

function renderPlayers(state) {
  $("#playerCount").textContent = String(state.players.length);
  $("#playersList").innerHTML = state.players.map((player) => `
    <div class="player-chip">
      <span class="online-dot ${player.online ? "" : "offline"}"></span>
      <span class="player-name">${esc(player.name)}</span>
      <small>${player.role === "host" ? "المضيف" : "لاعب"}</small>
    </div>
  `).join("");
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
  $("#wheel").style.transform = `rotate(${destination}deg)`;
  $("#spinBtn").disabled = true;
  setTimeout(() => { $("#spinBtn").disabled = false; }, 3300);
  toast(`الفئة المختارة: ${state.category}`);
}

function renderState(state) {
  if (!state || (currentSession && state.code !== currentSession.code)) return;
  const firstSnapshot = !currentState;
  const previousQuestionId = currentState?.question?.id;
  if (firstSnapshot) lastSpinId = Number(state.spinId) || 0;
  currentState = state;
  show("gameView");
  $("#roomLabel").textContent = state.roomName;
  $("#roomCode").textContent = state.code;
  $("#roundTitle").textContent = state.round === 1 ? "الجولة الأولى" : state.round === 2 ? "الجولة الثانية" : `الجولة ${state.round}`;
  $("#roundCount").textContent = `الجولة ${state.round}`;
  $("#questionNo").textContent = `التحدي ${state.questionIndex + 1}`;
  $("#category").textContent = state.category;
  $("#flag").textContent = state.question?.icon || "✨";
  $("#question").textContent = state.question?.prompt || "بانتظار التحدّي التالي";
  $("#answerText").textContent = state.question?.answer || "الإجابة متاحة للمضيف";
  if (previousQuestionId !== state.question?.id) {
    $("#answerBox").classList.add("hidden");
    $("#answerInput").value = "";
  }

  const isHost = currentRole === "host";
  document.querySelectorAll("[data-host-only]").forEach((element) => {
    element.classList.toggle("hidden", !isHost);
  });
  $("#guestHint").classList.toggle("hidden", isHost);
  if (!isHost) $("#answerBox").classList.add("hidden");

  $("#timerBtn").textContent = state.timerRunning ? "إيقاف المؤقت" : "ابدأ المؤقت";
  $("#timer").textContent = String(state.timeRemaining);
  const progress = state.timeLimit ? Math.min(100, (state.timeRemaining / state.timeLimit) * 100) : 0;
  $("#timerBar").style.width = `${progress}%`;
  $("#wheelResult").textContent = state.spinTarget
    ? `الفئة المختارة: ${state.category}`
    : "لفّ العجلة لاختيار الفئة التالية";
  renderScores(state);
  renderPlayers(state);
  animateWheel(state);
  setConnection(socket.connected ? (isHost ? "متصل · المضيف" : "متصل · لاعب") : "انقطع الاتصال", socket.connected);
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
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(new Error("لا يوجد اتصال بالخادم. تحقّق من الإنترنت وحاول مجددًا."));
      return;
    }
    const timeout = setTimeout(() => reject(new Error("انتهت مهلة الاتصال بالخادم. حاول مرة أخرى.")), 12000);
    socket.emit(eventName, payload, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}

async function runHostAction(action) {
  if (currentRole !== "host") {
    toast("هذا الإجراء متاح للمضيف فقط.");
    return null;
  }
  try {
    const result = await emitAck("host:action", { action });
    if (!result.ok) throw new Error(result.error || "تعذّر تنفيذ الإجراء.");
    renderState(result.state);
    return result.state;
  } catch (error) {
    toast(error.message);
    return null;
  }
}

function makeRoomLink(code) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  return url.toString();
}

$("#startBtn").addEventListener("click", () => {
  setupTeams();
  show("setupView");
  $("#setupView").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#teamCount").addEventListener("change", setupTeams);
setupTeams();

$("#saveSetup").addEventListener("click", async () => {
  const button = $("#saveSetup");
  const playerName = $("#playerName").value.trim();
  if (!playerName) {
    toast("اكتب اسم المضيف قبل إنشاء الغرفة.");
    $("#playerName").focus();
    return;
  }
  const teamNames = teams.map((_, index) => {
    const input = document.querySelector(`[data-team="${index}"]`);
    return input?.value.trim() || defaultTeamNames[index] || `الفريق ${index + 1}`;
  });
  button.disabled = true;
  button.textContent = "جارٍ إنشاء الغرفة...";
  try {
    const result = await emitAck("room:create", {
      playerName,
      roomName: $("#roomName").value,
      teams: teamNames,
      timeLimit: Number($("#roundTime").value),
    });
    if (!result.ok) throw new Error(result.error || "تعذّر إنشاء الغرفة.");
    saveSession({ code: result.code, role: "host", token: result.hostToken });
    renderState(result.state);
    toast(`تم إنشاء الغرفة ${result.code}`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "حفظ وبدء الجولة ←";
  }
});

$("#joinBtn").addEventListener("click", () => show("joinView"));
$("#backHome").addEventListener("click", () => {
  show("homeView");
  showJoinMessage("");
});
$("#joinConfirm").addEventListener("click", async () => {
  const code = $("#joinCode").value.trim().toUpperCase();
  const playerName = $("#joinPlayerName").value.trim();
  if (!playerName) {
    showJoinMessage("اكتب اسم اللاعب للمتابعة.");
    $("#joinPlayerName").focus();
    return;
  }
  if (!code) {
    showJoinMessage("اكتب رمز الغرفة أولًا.");
    $("#joinCode").focus();
    return;
  }

  const button = $("#joinConfirm");
  button.disabled = true;
  showJoinMessage("جارٍ التحقق من الغرفة...", false);
  try {
    const result = await emitAck("room:join", { code, playerName });
    if (!result.ok) throw new Error(result.error || "تعذّر الانضمام.");
    saveSession({ code: result.state.code, role: "player", token: result.playerToken });
    renderState(result.state);
    showJoinMessage("تم الانضمام إلى الغرفة.", false);
  } catch (error) {
    showJoinMessage(error.message);
  } finally {
    button.disabled = false;
  }
});
$("#joinCode").addEventListener("keydown", (event) => {
  if (event.key === "Enter") $("#joinConfirm").click();
});

$("#timerBtn").addEventListener("click", () => runHostAction("timer"));
$("#revealBtn").addEventListener("click", () => {
  if (currentRole === "host") $("#answerBox").classList.remove("hidden");
});
$("#correctBtn").addEventListener("click", async () => {
  const state = await runHostAction("correct");
  if (state) toast("تمت إضافة 10 نقاط للفريق النشط.");
});
$("#wrongBtn").addEventListener("click", async () => {
  const state = await runHostAction("wrong");
  if (state) toast("ولا يهمكم، جرّبوا التحدّي التالي.");
});
$("#nextBtn").addEventListener("click", () => runHostAction("next"));
$("#endRoundBtn").addEventListener("click", async () => {
  const state = await runHostAction("endRound");
  if (state) toast(`بدأت الجولة ${state.round}.`);
});
$("#resetBtn").addEventListener("click", () => {
  if (confirm("متأكد تبي تصفّر النقاط والجولة للجميع؟")) runHostAction("reset");
});
$("#addTeamBtn").addEventListener("click", async () => {
  const state = await runHostAction("addTeam");
  if (state) toast("تمت إضافة فريق.");
});
$("#spinBtn").addEventListener("click", () => runHostAction("spin"));

$("#copyCode").addEventListener("click", async () => {
  if (!currentState?.code) return;
  const link = makeRoomLink(currentState.code);
  try {
    await navigator.clipboard.writeText(link);
    toast("تم نسخ رابط الانضمام.");
  } catch {
    toast(link);
  }
});

$("#themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("shutabeem-theme", document.body.classList.contains("light") ? "light" : "dark");
});
if (localStorage.getItem("shutabeem-theme") === "light") document.body.classList.add("light");

$("#soundBtn").addEventListener("click", () => {
  muted = !muted;
  $("#soundBtn").textContent = muted ? "🔇" : "🔊";
  toast(muted ? "تم إيقاف الصوت" : "تم تفعيل الصوت");
});

socket.on("connect", async () => {
  setConnection("متصل بالخادم", true);
  const linkedCode = new URLSearchParams(location.search).get("room")?.toUpperCase();
  const session = currentSession || getSession();
  if (session?.code && session?.token && (!linkedCode || linkedCode === session.code)) {
    currentSession = session;
    currentRole = session.role;
    try {
      const result = await emitAck("room:resume", { code: session.code, token: session.token });
      if (result.ok) {
        renderState(result.state);
        return;
      }
      clearSession();
      if (new URLSearchParams(location.search).has("room")) show("joinView");
      toast(result.error);
    } catch (error) {
      setConnection(error.message, false);
    }
  }

  if (linkedCode) {
    if (currentSession?.code !== linkedCode) {
      currentSession = null;
      currentRole = null;
    }
    $("#joinCode").value = linkedCode.toUpperCase();
    show("joinView");
  }
});
socket.on("disconnect", () => setConnection("انقطع الاتصال · جارٍ إعادة المحاولة", false));
socket.on("connect_error", () => setConnection("تعذّر الاتصال بالخادم", false));
socket.on("room:state", (state) => {
  if (currentSession && state.code === currentSession.code) renderState(state);
});

setInterval(() => {
  if (!currentState) return;
  const remaining = currentState.timerRunning && currentState.timerEndsAt
    ? Math.max(0, Math.ceil((currentState.timerEndsAt - Date.now()) / 1000))
    : currentState.timeRemaining;
  $("#timer").textContent = String(remaining);
  const progress = currentState.timeLimit ? Math.min(100, (remaining / currentState.timeLimit) * 100) : 0;
  $("#timerBar").style.width = `${progress}%`;
}, 250);

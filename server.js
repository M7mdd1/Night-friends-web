const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const http = require("node:http");
const { Pool } = require("pg");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 5000);
const ROOM_CODE_PATTERN = /^SH-[A-Z0-9]{6}$/;
const MAX_PLAYERS = 32;

const CATEGORIES = [
  "أعلام العالم",
  "معلومات عامة",
  "ماركات السيارات",
  "ماركات المطاعم",
  "التحديات",
];

const COLORS = ["#ff9b63", "#47e0a1", "#a78bfa", "#f1cf55", "#ef78bd", "#75e6ef", "#fc7d79", "#8ce2a9"];
const FACES = ["🧑🏻", "🧑🏽", "🧑🏼", "🧑🏾", "🧑🏼‍🦱", "👩🏻", "👩🏽", "👩🏼"];

const QUESTION_BANK = {
  "أعلام العالم": [
    ["🇮🇹", "ما اسم الدولة التي يظهر علمها؟", "إيطاليا"],
    ["🇯🇵", "ما اسم الدولة التي يظهر علمها؟", "اليابان"],
    ["🇦🇪", "ما اسم الدولة التي يظهر علمها؟", "الإمارات العربية المتحدة"],
    ["🇧🇷", "ما اسم الدولة التي يظهر علمها؟", "البرازيل"],
    ["🇨🇦", "ما اسم الدولة التي يظهر علمها؟", "كندا"],
    ["🇲🇦", "ما اسم الدولة التي يظهر علمها؟", "المغرب"],
    ["🇰🇷", "ما اسم الدولة التي يظهر علمها؟", "كوريا الجنوبية"],
    ["🇸🇪", "ما اسم الدولة التي يظهر علمها؟", "السويد"],
    ["🇹🇷", "ما اسم الدولة التي يظهر علمها؟", "تركيا"],
    ["🇸🇦", "ما اسم الدولة التي يظهر علمها؟", "المملكة العربية السعودية"],
    ["🇪🇬", "ما اسم الدولة التي يظهر علمها؟", "مصر"],
    ["🇫🇷", "ما اسم الدولة التي يظهر علمها؟", "فرنسا"],
    ["🇩🇪", "ما اسم الدولة التي يظهر علمها؟", "ألمانيا"],
  ],
  "معلومات عامة": [
    ["🪐", "ما أكبر كواكب المجموعة الشمسية؟", "المشتري"],
    ["🌊", "ما أكبر محيط على كوكب الأرض؟", "المحيط الهادئ"],
    ["🫀", "كم عدد حجرات قلب الإنسان؟", "أربع حجرات"],
    ["🌱", "ما الغاز الذي تمتصه النباتات من الهواء؟", "ثاني أكسيد الكربون"],
    ["🦒", "ما أطول حيوان بري في العالم؟", "الزرافة"],
    ["🌙", "ما اسم أقرب جرم سماوي طبيعي إلى الأرض؟", "القمر"],
    ["🧊", "عند كم درجة مئوية يتجمد الماء؟", "صفر درجة مئوية"],
  ],
  "ماركات السيارات": [
    ["🚗", "ما هي الماركة التي شعارها حصان جامح بالأصفر؟", "فيراري"],
    ["🚙", "ما هي الماركة التي شعارها 4 حلقات متداخلة؟", "أودي"],
    ["🏎️", "ما هي الشركة المصنعة لسيارة كورفيت؟", "شيفروليه"],
    ["🚘", "ما هي الماركة اليابانية الفاخرة التابعة لشركة تويوتا؟", "لكزس"],
    ["🚙", "ما هي الماركة المشهورة بسيارات الدفع الرباعي الفاخرة ذات الشعار البريطاني؟", "رنج روفر"],
    ["🏎️", "ما هي الماركة الإيطالية التي شعارها ثور هائج؟", "لامبورغيني"],
    ["🚗", "ما هي الماركة التي شعارها نجمة ثلاثية داخل دائرة؟", "مرسيدس بنز"],
  ],
  "ماركات المطاعم": [
    ["🍔", "ما هو المطعم الشهير الذي شعاره حرف M أصفر كبير؟", "ماكدونالدز"],
    ["🍗", "ما هو المطعم الشهير المتخصص بالدجاج المقلي وصاحبه رجل بلحية بيضاء؟", "كنتاكي KFC"],
    ["🍕", "ما هو مطعم البيتزا الشهير الذي شعاره سقف أحمر قرميدي؟", "بيتزا هت"],
    ["🥪", "ما هو المطعم المشهور بسندويتشات الصبمارين (Sub)?", "سبرواي"],
    ["🍔", "ما هو المطعم الشهير بوجبة الوابر (Whopper)?", "برجر كنج"],
    ["☕", "ما هو سلسلة المقاهي الشهيرة التي شعارها حورية البحر ذات اللون الأخضر؟", "ستاربكس"],
  ],
  "التحديات": [
    ["🧠", "اذكر شيئًا له أسنان لكنه لا يعضّ.", "المشط"],
    ["🪑", "ما الشيء الذي له أربع أرجل ولا يستطيع المشي؟", "الكرسي"],
    ["🔑", "ما الذي يفتح الأبواب ولا يدخل منها؟", "المفتاح"],
    ["📅", "كم شهرًا في السنة يحتوي على 28 يومًا؟", "كل شهور السنة"],
    ["🕯️", "ما الذي يكبر كلما أخذت منه؟", "الحفرة"],
  ],
};

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL غير موجود.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, { serveClient: true, cors: { origin: true } });

app.disable("x-powered-by");
app.get(["/", "/index.html"], (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/style.css", (_req, res) => res.sendFile(path.join(__dirname, "style.css")));
app.get("/responsive.css", (_req, res) => res.sendFile(path.join(__dirname, "responsive.css")));
app.get("/app.js", (_req, res) => res.sendFile(path.join(__dirname, "app.js")));

function cleanName(val, fb) { return String(val || "").trim().slice(0, 26) || fb; }
function normalizeCode(val) { return String(val || "").trim().toUpperCase(); }
function tokenHash(t) { return crypto.createHash("sha256").update(String(t)).digest("hex"); }
function safeCompareHash(l, r) { return l && r && l.length === r.length && crypto.timingSafeEqual(Buffer.from(l), Buffer.from(r)); }

function drawQuestion(state, category) {
  const bank = QUESTION_BANK[category] || QUESTION_BANK["معلومات عامة"];
  const used = new Set(state.usedQuestionIds[category] || []);
  let available = bank.map((entry, index) => ({ entry, index })).filter(({ index }) => !used.has(`${category}-${index}`));
  if (!available.length) {
    state.usedQuestionIds[category] = [];
    available = bank.map((entry, index) => ({ entry, index }));
  }
  const picked = available[crypto.randomInt(available.length)];
  state.usedQuestionIds[category] = [...(state.usedQuestionIds[category] || []), `${category}-${picked.index}`];
  const [icon, prompt, answer] = picked.entry;
  state.question = { category, icon, prompt, answer };
}

function publicState(source, includeAnswer) {
  const state = structuredClone(source);
  state.players = (state.players || []).map(({ tokenHash: _t, ...p }) => p);
  if (!includeAnswer && state.question) delete state.question.answer;
  return state;
}

async function findRoom(code) {
  const res = await pool.query('SELECT state FROM "db-game" WHERE code = $1', [code]);
  return res.rows[0]?.state || null;
}

async function notifyRoom(code) {
  await pool.query("SELECT pg_notify('shutabeem_room_updates', $1)", [code]);
}

async function withLockedRoom(code, update) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sel = await client.query('SELECT state FROM "db-game" WHERE code = $1 FOR UPDATE', [code]);
    if (!sel.rows.length) { await client.query("ROLLBACK"); return null; }
    const state = sel.rows[0].state;
    const value = await update(state);
    await client.query('UPDATE "db-game" SET state = $1::jsonb, updated_at = NOW() WHERE code = $2', [JSON.stringify(state), code]);
    await client.query("COMMIT");
    await notifyRoom(code);
    return { state, value };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

io.on("connection", (socket) => {
  socket.on("room:create", async (payload = {}, ack) => {
    try {
      const hostName = cleanName(payload.playerName, "المضيف");
      const rawTeams = Array.isArray(payload.teams) ? payload.teams : ["الفريق الأول", "الفريق الثاني"];
      const timeLimit = Number(payload.timeLimit) || 60;
      const hostToken = crypto.randomBytes(32).toString("base64url");
      const hostId = crypto.randomUUID();

      const state = {
        code: "",
        roomName: cleanName(payload.roomName, "تحدي الأصدقاء"),
        teams: rawTeams.map((name, i) => ({
          name: cleanName(name, `الفريق ${i + 1}`),
          timeRemaining: timeLimit, // نظام الوقت لكل فريق
          isEliminated: false,
          color: COLORS[i % COLORS.length],
          face: FACES[i % FACES.length]
        })),
        activeTeamIndex: 0,
        round: 1,
        category: CATEGORIES[0],
        showWheel: true, // للمضيف لإخفاء/إظهار الروليت
        question: null,
        usedQuestionIds: {},
        timeLimit,
        timerRunning: false,
        timerEndsAt: null,
        players: [{ id: hostId, name: hostName, role: "host", online: true }]
      };
      drawQuestion(state, state.category);

      let created = false, code = "";
      for (let i = 0; i < 5 && !created; i++) {
        code = `SH-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
        state.code = code;
        try {
          await pool.query('INSERT INTO "db-game" (code, host_token_hash, state) VALUES ($1, $2, $3::jsonb)', [code, tokenHash(hostToken), JSON.stringify(state)]);
          created = true;
        } catch (err) { if (err.code !== "23505") throw err; }
      }
      socket.data = { code, playerId: hostId, isHost: true };
      socket.join(code);
      if (typeof ack === "function") ack({ ok: true, code, hostToken, state: publicState(state, true) });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: "تعذّر إنشاء الغرفة." });
    }
  });

  socket.on("room:join", async (payload = {}, ack) => {
    try {
      const code = normalizeCode(payload.code);
      const name = cleanName(payload.playerName, "لاعب");
      const playerId = crypto.randomUUID();
      const playerToken = crypto.randomBytes(32).toString("base64url");

      const res = await withLockedRoom(code, (state) => {
        state.players.push({ id: playerId, name, role: "player", online: true, tokenHash: tokenHash(playerToken) });
      });
      if (!res) return typeof ack === "function" && ack({ ok: false, error: "الغرفة غير موجودة." });

      socket.data = { code, playerId, isHost: false };
      socket.join(code);
      if (typeof ack === "function") ack({ ok: true, playerToken, state: publicState(res.state, false) });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: "تعذّر الانضمام." });
    }
  });

  socket.on("room:resume", async (payload = {}, ack) => {
    try {
      const code = normalizeCode(payload.code);
      const token = String(payload.token || "");
      const res = await pool.query('SELECT host_token_hash, state FROM "db-game" WHERE code = $1', [code]);
      if (!res.rows.length) return typeof ack === "function" && ack({ ok: false, error: "غير موجودة." });
      const row = res.rows[0];
      const isHost = safeCompareHash(row.host_token_hash, tokenHash(token));
      const player = isHost ? row.state.players.find(p => p.role === "host") : row.state.players.find(p => safeCompareHash(p.tokenHash, tokenHash(token)));
      if (!player) return typeof ack === "function" && ack({ ok: false, error: "انتهت الجلسة." });

      socket.data = { code, playerId: player.id, isHost };
      socket.join(code);
      if (typeof ack === "function") ack({ ok: true, state: publicState(row.state, isHost) });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: "خطأ بالاستعادة." });
    }
  });

  socket.on("host:action", async (payload = {}, ack) => {
    if (!socket.data.isHost || !socket.data.code) return typeof ack === "function" && ack({ ok: false, error: "للمضيف فقط." });
    try {
      const code = socket.data.code;
      const { action, value } = payload;

      const res = await withLockedRoom(code, (state) => {
        if (action === "toggleWheel") {
          state.showWheel = !state.showWheel;
        } else if (action === "setCategory") {
          state.category = value;
          drawQuestion(state, value);
          state.showWheel = false; // إخفاء الروليت بعد الاختيار والبدء بالتحدي
        } else if (action === "correct" || action === "wrong") {
          // عند الإجابة الصحيحة أو الخاطئة، ينتقل الدور للفريق التالي تلقائياً
          let nextTeam = (state.activeTeamIndex + 1) % state.teams.length;
          while(state.teams[nextTeam].isEliminated && state.teams.some(t => !t.isEliminated)) {
            nextTeam = (nextTeam + 1) % state.teams.length;
          }
          state.activeTeamIndex = nextTeam;
          drawQuestion(state, state.category);
        } else if (action === "nextCategory") {
          state.showWheel = true; // إظهار الروليت لاختيار جولة جديدة
        }
      });
      if (typeof ack === "function") ack({ ok: true, state: publicState(res.state, true) });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: "تعذّر التنفيذ." });
    }
  });
});

async function start() {
  const listener = await pool.connect();
  await listener.query(`
    CREATE TABLE IF NOT EXISTS "db-game" (
      code VARCHAR(12) PRIMARY KEY,
      host_token_hash TEXT NOT NULL,
      state JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  server.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}
start();

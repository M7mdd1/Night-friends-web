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
  "سرعة البديهة",
  "التمثيل",
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
    ["🇿🇦", "ما اسم الدولة التي يظهر علمها؟", "جنوب أفريقيا"],
    ["🇸🇦", "ما اسم الدولة التي يظهر علمها؟", "المملكة العربية السعودية"],
    ["🇪🇬", "ما اسم الدولة التي يظهر علمها؟", "مصر"],
    ["🇫🇷", "ما اسم الدولة التي يظهر علمها؟", "فرنسا"],
    ["🇩🇪", "ما اسم الدولة التي يظهر علمها؟", "ألمانيا"],
    ["🇪🇸", "ما اسم الدولة التي يظهر علمها؟", "إسبانيا"],
    ["🇦🇷", "ما اسم الدولة التي يظهر علمها؟", "الأرجنتين"],
    ["🇺🇸", "ما اسم الدولة التي يظهر علمها؟", "الولايات المتحدة الأمريكية"],
    ["🇬🇧", "ما اسم الدولة التي يظهر علمها؟", "المملكة المتحدة"],
  ],
  "معلومات عامة": [
    ["🪐", "ما أكبر كواكب المجموعة الشمسية؟", "المشتري"],
    ["🌊", "ما أكبر محيط على كوكب الأرض؟", "المحيط الهادئ"],
    ["🫀", "كم عدد حجرات قلب الإنسان؟", "أربع حجرات"],
    ["🌱", "ما الغاز الذي تمتصه النباتات من الهواء؟", "ثاني أكسيد الكربون"],
    ["🦒", "ما أطول حيوان بري في العالم؟", "الزرافة"],
    ["🌙", "ما اسم أقرب جرم سماوي طبيعي إلى الأرض؟", "القمر"],
    ["🧊", "عند كم درجة مئوية يتجمد الماء؟", "صفر درجة مئوية"],
    ["📚", "كم عدد أضلاع الشكل السداسي؟", "ستة أضلاع"],
    ["🏜️", "ما أكبر صحراء حارة في العالم؟", "الصحراء الكبرى"],
    ["🐙", "كم ذراعًا للأخطبوط؟", "ثمانية أذرع"],
    ["⭐", "ما هي أقرب نجمة إلى كوكب الأرض بعد الشمس؟", "قنطورس الأقرب (بروكسيما سنتوري)"],
    ["🧠", "ما هو الجزء المسؤول عن التوازن في مخ الإنسان؟", "المخيخ"],
  ],
  "سرعة البديهة": [
    ["⚡", "اذكر ثلاثة أشياء لونها أحمر خلال 5 ثوانٍ!", "أي ثلاثة أشياء حمراء"],
    ["⏱️", "اذكر ثلاثة حيوانات تبدأ بحرف السين خلال 5 ثوانٍ!", "مثل: سمكة، سنجاب، سلحفاة"],
    ["🍽️", "اذكر ثلاثة أطعمة دائرية خلال 5 ثوانٍ!", "أي ثلاثة أطعمة دائرية"],
    ["🔤", "قل خمس كلمات تبدأ بحرف الميم خلال 5 ثوانٍ!", "أي خمس كلمات تبدأ بالميم"],
    ["🏠", "اذكر ثلاثة أشياء تجدها في المطبخ خلال 5 ثوانٍ!", "أي ثلاثة أشياء في المطبخ"],
    ["🎨", "اذكر لونين لا يظهران في قوس قزح خلال 5 ثوانٍ!", "مثل: بني، وردي"],
    ["🌍", "سمّ ثلاث عواصم عربية خلال 5 ثوانٍ!", "مثل: عمّان، القاهرة، الرياض"],
    ["🎵", "اذكر ثلاثة أشياء تصدر صوتًا خلال 5 ثوانٍ!", "أي ثلاثة أشياء تصدر صوتًا"],
  ],
  "التمثيل": [
    ["🎭", "مثّل مهنة الطبيب بدون كلام ودع فريقك يخمّن!", "الطبيب"],
    ["🐒", "قلّد حركة قرد لمدة خمس ثوانٍ!", "تقليد القرد"],
    ["🎬", "مثّل شخصًا يبحث عن هاتفه وهو في يده!", "شخص يبحث عن هاتفه"],
    ["⚽", "مثّل لاعبًا سجّل هدفًا في آخر ثانية!", "لاعب يحتفل بهدف"],
    ["🧑‍🍳", "مثّل طباخًا تذوّق طبقًا شديد الملوحة!", "طباخ تذوّق طبقًا مالحًا"],
    ["🐧", "امشِ مثل البطريق حتى يعدّ فريقك إلى خمسة!", "المشي مثل البطريق"],
    ["🎤", "مثّل أنك تغني أمام جمهور كبير دون إصدار صوت!", "مغنٍ على المسرح"],
    ["🧹", "مثّل أنك تنظّف غرفة ثم اكتشفت فوضى أكبر!", "تنظيف غرفة فوضوية"],
  ],
  "التحديات": [
    ["🧠", "اذكر شيئًا له أسنان لكنه لا يعضّ.", "المشط"],
    ["🪑", "ما الشيء الذي له أربع أرجل ولا يستطيع المشي؟", "الكرسي أو الطاولة"],
    ["🔑", "ما الذي يفتح الأبواب ولا يدخل منها؟", "المفتاح"],
    ["📅", "كم شهرًا في السنة يحتوي على 28 يومًا؟", "كل شهور السنة"],
    ["🕯️", "ما الذي يكبر كلما أخذت منه؟", "الحفرة"],
    ["🥚", "أيهما جاء أولًا: الدجاجة أم البيضة؟", "إجابة الفريق مع تبرير مقنع"],
    ["🗣️", "قل «خيط حرير على حيط خليل» ثلاث مرات بسرعة!", "إكمال العبارة ثلاث مرات"],
    ["🙌", "حافظ على توازنك واقفًا على قدم واحدة لعشر ثوانٍ!", "إكمال التحدي لعشر ثوانٍ"],
    ["🤔", "ما الشيء الذي يسمع بلا أذن ويتكلم بلا لسان؟", "الصدى"],
  ],
};

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL غير موجود. يرجى ربط قاعدة PostgreSQL.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  serveClient: true,
  cors: { origin: true, credentials: false },
});

app.disable("x-powered-by");
app.get(["/", "/index.html"], (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/style.css", (_req, res) => {
  res.sendFile(path.join(__dirname, "style.css"));
});
app.get("/responsive.css", (_req, res) => {
  res.sendFile(path.join(__dirname, "responsive.css"));
});
app.get("/favicon.ico", (_req, res) => {
  res.status(204).end();
});
app.get("/app.js", (_req, res) => {
  res.sendFile(path.join(__dirname, "app.js"));
});
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: "database_unavailable" });
  }
});

function cleanName(value, fallback) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 26) || fallback;
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function safeCompareHash(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function getRemainingSeconds(state, now = Date.now()) {
  if (state.timerRunning && state.timerEndsAt) {
    return Math.max(0, Math.ceil((state.timerEndsAt - now) / 1000));
  }
  return Math.max(0, Number(state.timeRemaining) || 0);
}

function drawQuestion(state, category) {
  const bank = QUESTION_BANK[category];
  if (!bank) throw new Error("Unknown question category");
  const used = new Set(state.usedQuestionIds[category] || []);
  let available = bank
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => !used.has(`${category}-${index + 1}`));

  if (!available.length) {
    state.usedQuestionIds[category] = [];
    available = bank.map((entry, index) => ({ entry, index }));
  }

  const picked = available[crypto.randomInt(available.length)];
  const id = `${category}-${picked.index + 1}`;
  state.usedQuestionIds[category] = [...(state.usedQuestionIds[category] || []), id];
  const [icon, prompt, answer] = picked.entry;
  state.question = { id, category, icon, prompt, answer };
}

function publicState(source, includeAnswer) {
  const state = structuredClone(source);
  state.players = (state.players || []).map(({ tokenHash: _tokenHash, ...player }) => player);
  if (!includeAnswer && state.question) delete state.question.answer;
  state.timeRemaining = getRemainingSeconds(source);
  return state;
}

async function findRoom(code) {
  const result = await pool.query('SELECT state FROM "db-game" WHERE code = $1', [code]);
  return result.rows[0]?.state || null;
}

async function broadcastRoom(code) {
  const state = await findRoom(code);
  if (!state) return;
  const sockets = await io.in(code).fetchSockets();
  for (const client of sockets) {
    client.emit("room:state", publicState(state, client.data.isHost === true));
  }
}

async function notifyRoom(code) {
  await pool.query("SELECT pg_notify('shutabeem_room_updates', $1)", [code]);
}

async function withLockedRoom(code, update) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      'SELECT state FROM "db-game" WHERE code = $1 FOR UPDATE',
      [code],
    );
    if (!selected.rows.length) {
      await client.query("ROLLBACK");
      return null;
    }
    const state = selected.rows[0].state;
    const value = await update(state);
    await client.query(
      'UPDATE "db-game" SET state = $1::jsonb, updated_at = NOW() WHERE code = $2',
      [JSON.stringify(state), code],
    );
    await client.query("COMMIT");
    await notifyRoom(code);
    return { state, value };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function markPlayerOnline(code, playerId, online) {
  return withLockedRoom(code, (state) => {
    const player = state.players.find((entry) => entry.id === playerId);
    if (player) player.online = online;
  });
}

function attachSocket(socket, code, playerId, isHost) {
  socket.data.code = code;
  socket.data.playerId = playerId;
  socket.data.isHost = isHost;
  socket.join(code);
}

function respond(ack, value) {
  if (typeof ack === "function") ack(value);
}

io.on("connection", (socket) => {
  socket.on("room:create", async (payload = {}, ack) => {
    try {
      if (socket.data.code) return respond(ack, { ok: false, error: "أنت داخل غرفة بالفعل." });
      const hostName = cleanName(payload.playerName, "");
      if (!hostName) return respond(ack, { ok: false, error: "اكتب اسمك قبل إنشاء الغرفة." });

      const rawTeams = Array.isArray(payload.teams) ? payload.teams : [];
      if (rawTeams.length < 2 || rawTeams.length > 8) {
        return respond(ack, { ok: false, error: "اختر من فريقين إلى 8 فرق." });
      }
      const timeLimit = [30, 45, 60].includes(Number(payload.timeLimit)) ? Number(payload.timeLimit) : 45;
      const hostToken = crypto.randomBytes(32).toString("base64url");
      const hostId = crypto.randomUUID();
      const state = {
        code: "",
        roomName: cleanName(payload.roomName, "غرفة اللعب"),
        host: { id: hostId, name: hostName },
        players: [{ id: hostId, name: hostName, role: "host", online: true }],
        teams: rawTeams.map((teamName, index) => ({
          name: cleanName(teamName, `الفريق ${index + 1}`),
          score: 0,
          color: COLORS[index % COLORS.length],
          face: FACES[index % FACES.length],
        })),
        round: 1,
        questionIndex: 0,
        category: CATEGORIES[0],
        question: null,
        usedQuestionIds: {},
        timeLimit,
        timeRemaining: timeLimit,
        timerRunning: false,
        timerEndsAt: null,
        spinId: 0,
        spinTarget: null,
      };
      drawQuestion(state, state.category);

      let created = false;
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        const code = `SH-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
        state.code = code;
        try {
          await pool.query(
            'INSERT INTO "db-game" (code, host_token_hash, state) VALUES ($1, $2, $3::jsonb)',
            [code, tokenHash(hostToken), JSON.stringify(state)],
          );
          created = true;
        } catch (error) {
          if (error.code !== "23505") throw error;
        }
      }
      if (!created) throw new Error("تعذّر إنشاء رمز غرفة فريد.");

      attachSocket(socket, state.code, hostId, true);
      await notifyRoom(state.code);
      respond(ack, { ok: true, code: state.code, hostToken, state: publicState(state, true) });
    } catch (error) {
      respond(ack, { ok: false, error: "تعذّر إنشاء الغرفة الآن." });
    }
  });

  socket.on("room:join", async (payload = {}, ack) => {
    try {
      if (socket.data.code) return respond(ack, { ok: false, error: "أنت داخل غرفة بالفعل." });
      const code = normalizeCode(payload.code);
      const name = cleanName(payload.playerName, "");
      if (!name) return respond(ack, { ok: false, error: "اكتب اسمك للانضمام." });
      if (!ROOM_CODE_PATTERN.test(code)) return respond(ack, { ok: false, error: "صيغة الرمز غير صحيحة." });

      const playerId = crypto.randomUUID();
      const playerToken = crypto.randomBytes(32).toString("base64url");
      const change = await withLockedRoom(code, (state) => {
        if (state.players.length >= MAX_PLAYERS) throw new Error("الغرفة ممتلئة.");
        state.players.push({ id: playerId, name, role: "player", online: true, tokenHash: tokenHash(playerToken) });
      });
      if (!change) return respond(ack, { ok: false, error: "لم نعثر على غرفة بهذا الرمز." });

      attachSocket(socket, code, playerId, false);
      respond(ack, { ok: true, playerToken, state: publicState(change.state, false) });
    } catch (error) {
      respond(ack, { ok: false, error: error.message || "تعذّر الانضمام." });
    }
  });

  socket.on("room:resume", async (payload = {}, ack) => {
    try {
      if (socket.data.code) return respond(ack, { ok: false, error: "متصل بغرفة بالفعل." });
      const code = normalizeCode(payload.code);
      const token = String(payload.token || "");
      if (!ROOM_CODE_PATTERN.test(code) || token.length < 30) {
        return respond(ack, { ok: false, error: "تعذّر الاستعادة." });
      }
      const result = await pool.query(
        'SELECT host_token_hash, state FROM "db-game" WHERE code = $1',
        [code],
      );
      if (!result.rows.length) return respond(ack, { ok: false, error: "الغرفة غير موجودة." });
      const row = result.rows[0];
      const candidateHash = tokenHash(token);
      const isHost = safeCompareHash(row.host_token_hash, candidateHash);
      const player = isHost
        ? row.state.players.find((entry) => entry.role === "host")
        : row.state.players.find((entry) => entry.role === "player" && safeCompareHash(entry.tokenHash, candidateHash));
      if (!player) return respond(ack, { ok: false, error: "انتهت الصلاحية." });

      const change = await markPlayerOnline(code, player.id, true);
      attachSocket(socket, code, player.id, isHost);
      respond(ack, { ok: true, state: publicState(change?.state || row.state, isHost) });
    } catch (error) {
      respond(ack, { ok: false, error: "تعذّرت استعادة الجلسة." });
    }
  });

  socket.on("host:action", async (payload = {}, ack) => {
    if (!socket.data.isHost || !socket.data.code) {
      return respond(ack, { ok: false, error: "متاح للمضيف فقط." });
    }
    try {
      const code = socket.data.code;
      const now = Date.now();
      const action = String(payload.action || "");
      const res = await withLockedRoom(code, (state) => {
        if (action === "timer") {
          if (state.timerRunning) {
            state.timeRemaining = getRemainingSeconds(state, now);
            state.timerRunning = false;
            state.timerEndsAt = null;
          } else {
            if (getRemainingSeconds(state, now) <= 0) state.timeRemaining = state.timeLimit;
            state.timerEndsAt = now + state.timeRemaining * 1000;
            state.timerRunning = true;
          }
          return;
        }

        if (action === "next" || action === "correct" || action === "wrong" || action === "endRound") {
          if (action === "correct" && state.teams.length) {
            const activeTeam = state.questionIndex % state.teams.length;
            state.teams[activeTeam].score += 10;
          }
          if (action === "endRound") state.round += 1;
          state.timerRunning = false;
          state.timerEndsAt = null;
          state.timeRemaining = state.timeLimit;
          state.questionIndex += 1;
          drawQuestion(state, state.category);
          return;
        }

        if (action === "spin") {
          const category = CATEGORIES[crypto.randomInt(CATEGORIES.length)];
          state.category = category;
          state.questionIndex += 1;
          state.timerRunning = false;
          state.timerEndsAt = null;
          state.timeRemaining = state.timeLimit;
          state.spinId = (state.spinId || 0) + 1;
          state.spinTarget = category;
          drawQuestion(state, category);
          return;
        }

        if (action === "reset") {
          state.teams.forEach((team) => { team.score = 0; });
          state.round = 1;
          state.questionIndex = 0;
          state.category = CATEGORIES[0];
          state.spinTarget = null;
          state.usedQuestionIds = {};
          state.timerRunning = false;
          state.timerEndsAt = null;
          state.timeRemaining = state.timeLimit;
          drawQuestion(state, state.category);
          return;
        }

        if (action === "addTeam") {
          if (state.teams.length >= 8) throw new Error("وصلتم إلى الحد الأقصى وهو 8 فرق.");
          const index = state.teams.length;
          state.teams.push({
            name: `الفريق ${index + 1}`,
            score: 0,
            color: COLORS[index % COLORS.length],
            face: FACES[index % FACES.length],
          });
          return;
        }

        throw new Error("هذا الإجراء غير متاح.");
      });

      if (!res) return respond(ack, { ok: false, error: "الغرفة غير موجودة." });
      respond(ack, { ok: true, state: publicState(res.state, true) });
    } catch (error) {
      respond(ack, { ok: false, error: error.message || "تعذّر التنفيذ." });
    }
  });

  socket.on("disconnect", async () => {
    const { code, playerId } = socket.data;
    if (!code || !playerId) return;
    try {
      const otherSockets = await io.in(code).fetchSockets();
      if (otherSockets.some((other) => other.data.playerId === playerId)) return;
      await markPlayerOnline(code, playerId, false);
    } catch (error) {}
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

  await listener.query("LISTEN shutabeem_room_updates");
  listener.on("notification", ({ payload }) => {
    if (!payload || !ROOM_CODE_PATTERN.test(payload)) return;
    broadcastRoom(payload).catch(() => {});
  });
  listener.on("error", () => {});
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`تحدي الأصدقاء يعمل على المنفذ ${PORT}`);
  });
}

start().catch((error) => {
  console.error("خطأ في بدء التشغيل:", error.message);
  process.exit(1);
});

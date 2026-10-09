const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { io: createClient } = require("socket.io-client");
const { Pool } = require("pg");

const baseUrl = process.env.TEST_APP_URL || "http://127.0.0.1:5000";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let roomCode;
let hostSocket;
let guestSocket;

function connectClient() {
  return new Promise((resolve, reject) => {
    const client = createClient(baseUrl, {
      reconnection: false,
      timeout: 5000,
    });
    const timer = setTimeout(() => reject(new Error("Socket connection timed out")), 7000);
    client.once("connect", () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once("connect_error", (error) => {
      clearTimeout(timer);
      client.close();
      reject(error);
    });
  });
}

function emitAck(client, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} acknowledgement timed out`)), 7000);
    client.emit(event, payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function nextState(client, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off("room:state", onState);
      reject(new Error("Timed out waiting for a room state update"));
    }, 7000);
    function onState(state) {
      if (!predicate(state)) return;
      clearTimeout(timer);
      client.off("room:state", onState);
      resolve(state);
    }
    client.on("room:state", onState);
  });
}

after(async () => {
  hostSocket?.close();
  guestSocket?.close();
  if (roomCode) await pool.query("DELETE FROM game_rooms WHERE code = $1", [roomCode]);
  await pool.end();
});

test("host and a second client share a persistent, host-controlled room", async () => {
  assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
  hostSocket = await connectClient();
  guestSocket = await connectClient();

  const created = await emitAck(hostSocket, "room:create", {
    playerName: "المضيف",
    roomName: "اختبار مباشر",
    teams: ["فريق ألف", "فريق باء"],
    timeLimit: 30,
  });
  assert.equal(created.ok, true, created.error);
  roomCode = created.code;
  assert.match(roomCode, /^SH-[A-Z0-9]{6}$/);
  assert.equal(created.state.question.category, created.state.category);

  const invalidCode = await emitAck(guestSocket, "room:join", {
    code: "SH-ZZZZZZ",
    playerName: "لاعب آخر",
  });
  assert.equal(invalidCode.ok, false);
  assert.match(invalidCode.error, /لم نعثر على غرفة/);

  const hostUpdate = nextState(hostSocket, (state) => state.players.some((player) => player.name === "ليلى"));
  const joined = await emitAck(guestSocket, "room:join", { code: roomCode, playerName: "ليلى" });
  assert.equal(joined.ok, true, joined.error);
  assert.equal(joined.state.question.answer, undefined, "answer is not sent to guest clients");
  assert.equal((await hostUpdate).players.length, 2);

  const denied = await emitAck(guestSocket, "host:action", { action: "reset" });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /متاح للمضيف فقط/);

  const guestSpinUpdate = nextState(guestSocket, (state) => state.spinId === 1);
  const spun = await emitAck(hostSocket, "host:action", { action: "spin" });
  assert.equal(spun.ok, true, spun.error);
  assert.equal(spun.state.category, spun.state.spinTarget);
  assert.equal(spun.state.question.category, spun.state.category);
  assert.notEqual(spun.state.question.id, created.state.question.id);
  const guestAfterSpin = await guestSpinUpdate;
  assert.equal(guestAfterSpin.category, spun.state.category);
  assert.equal(guestAfterSpin.question.category, guestAfterSpin.category);

  const guestTimerUpdate = nextState(guestSocket, (state) => state.timerRunning);
  const timerStarted = await emitAck(hostSocket, "host:action", { action: "timer" });
  assert.equal(timerStarted.ok, true);
  assert.equal((await guestTimerUpdate).timerRunning, true);

  const scoringTeam = spun.state.questionIndex % spun.state.teams.length;
  const guestScoreUpdate = nextState(guestSocket, (state) => state.teams[scoringTeam].score === 10);
  const scored = await emitAck(hostSocket, "host:action", { action: "correct" });
  assert.equal(scored.ok, true);
  assert.equal((await guestScoreUpdate).teams[scoringTeam].score, 10);

  const stored = await pool.query("SELECT state FROM game_rooms WHERE code = $1", [roomCode]);
  assert.equal(stored.rows[0].state.teams[scoringTeam].score, 10);
  assert.equal(stored.rows[0].state.category, scored.state.category);
});

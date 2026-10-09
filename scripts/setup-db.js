const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL غير موجود. فعّل PostgreSQL للمشروع ثم أعد المحاولة.");
  process.exit(1);
}

async function setup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const schema = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
    await pool.query(schema);
    console.log("تم تجهيز جداول شوطابيم في قاعدة بيانات التطوير.");
  } finally {
    await pool.end();
  }
}

setup().catch((error) => {
  console.error("تعذّر تجهيز قاعدة البيانات:", error.message);
  process.exitCode = 1;
});

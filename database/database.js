const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
const guildsDir = path.join(dataDir, 'guilds');
const logsDir = path.join(dataDir, 'logs');

const guildDbCache = new Map();
const logsDbCache = new Map();

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function initGuildSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_data (
      guild_id TEXT PRIMARY KEY,
      last_used_category TEXT,
      panel_settings TEXT,
      admin_logs TEXT,
      created_at TEXT
    );
  `);
}

function initLogsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      user_id TEXT,
      action TEXT,
      channels_deleted INTEGER,
      category_id TEXT,
      timestamp TEXT
    );
  `);
}

function getGuildDb(guildId) {
  ensureDir(guildsDir);
  const dbPath = path.join(guildsDir, `${guildId}.db`);
  if (!guildDbCache.has(dbPath)) {
    const db = new Database(dbPath);
    initGuildSchema(db);
    guildDbCache.set(dbPath, db);
  }
  return guildDbCache.get(dbPath);
}

function getLogsDb(guildId) {
  ensureDir(logsDir);
  const dbPath = path.join(logsDir, `${guildId}.db`);
  if (!logsDbCache.has(dbPath)) {
    const db = new Database(dbPath);
    initLogsSchema(db);
    logsDbCache.set(dbPath, db);
  }
  return logsDbCache.get(dbPath);
}

module.exports = {
  getGuildDb,
  getLogsDb,
};

const { getGuildDb } = require('./database');

function ensureGuildRecord(guildId) {
  const db = getGuildDb(guildId);
  const exists = db.prepare('SELECT guild_id FROM guild_data WHERE guild_id = ?').get(guildId);
  if (!exists) {
    db.prepare(
      'INSERT INTO guild_data (guild_id, last_used_category, panel_settings, admin_logs, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(guildId, null, null, null, new Date().toISOString());
  }
}

function getGuildData(guildId) {
  const db = getGuildDb(guildId);
  ensureGuildRecord(guildId);
  return db.prepare('SELECT * FROM guild_data WHERE guild_id = ?').get(guildId);
}

function setLastUsedCategory(guildId, categoryId) {
  const db = getGuildDb(guildId);
  ensureGuildRecord(guildId);
  db.prepare('UPDATE guild_data SET last_used_category = ? WHERE guild_id = ?').run(categoryId, guildId);
}

function setPanelSettings(guildId, settings) {
  const db = getGuildDb(guildId);
  ensureGuildRecord(guildId);
  db.prepare('UPDATE guild_data SET panel_settings = ? WHERE guild_id = ?').run(JSON.stringify(settings), guildId);
}

module.exports = {
  getGuildData,
  setLastUsedCategory,
  setPanelSettings,
};

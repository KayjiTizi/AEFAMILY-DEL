const { getLogsDb } = require('./database');

function logAdminAction({ guildId, userId, action, channelsDeleted, categoryId }) {
  const db = getLogsDb(guildId);
  db.prepare(
    'INSERT INTO admin_logs (guild_id, user_id, action, channels_deleted, category_id, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(guildId, userId, action, channelsDeleted, categoryId, new Date().toISOString());
}

module.exports = {
  logAdminAction,
};

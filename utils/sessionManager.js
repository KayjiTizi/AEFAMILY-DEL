const { sessionCache, TTL_SECONDS } = require('./cacheManager');

const SESSION_TTL_MS = 5 * 60 * 1000;

function createSession({ messageId, channelId, guildId, userId }) {
  const session = {
    messageId,
    channelId,
    guildId,
    userId,
    categoryId: null,
    page: 0,
    selectedChannelIds: [],
    state: 'MAIN',
    createdAt: Date.now(),
  };
  sessionCache.set(messageId, session, TTL_SECONDS);
  return session;
}

function getSession(messageId) {
  return sessionCache.get(messageId);
}

function updateSession(messageId, patch) {
  const current = getSession(messageId);
  if (!current) return null;
  const next = { ...current, ...patch };
  sessionCache.set(messageId, next, TTL_SECONDS);
  return next;
}

function touchSession(messageId) {
  if (!sessionCache.has(messageId)) return null;
  sessionCache.ttl(messageId, TTL_SECONDS);
  return getSession(messageId);
}

function endSession(messageId) {
  sessionCache.del(messageId);
}

module.exports = {
  SESSION_TTL_MS,
  createSession,
  getSession,
  updateSession,
  touchSession,
  endSession,
};

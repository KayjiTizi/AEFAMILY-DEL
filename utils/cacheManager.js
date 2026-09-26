const NodeCache = require('node-cache');

const TTL_SECONDS = 300;

function createCache() {
  return new NodeCache({
    stdTTL: TTL_SECONDS,
    checkperiod: 120,
    useClones: false,
    deleteOnExpire: true,
  });
}

const guildCache = createCache();
const sessionCache = createCache();
const categoryCache = createCache();
const channelCache = createCache();

function safePrune(cache) {
  if (typeof cache.prune === 'function') {
    cache.prune();
  }
}

setInterval(() => {
  safePrune(guildCache);
  safePrune(sessionCache);
  safePrune(categoryCache);
  safePrune(channelCache);
}, 60 * 1000).unref();

module.exports = {
  TTL_SECONDS,
  guildCache,
  sessionCache,
  categoryCache,
  channelCache,
};

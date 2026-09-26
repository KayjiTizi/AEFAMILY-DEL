const { ChannelType } = require('discord.js');
const { categoryCache, channelCache } = require('./cacheManager');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function getCategories(guild) {
  const cacheKey = `categories:${guild.id}`;
  const cached = categoryCache.get(cacheKey);
  if (cached) return cached;

  const categories = guild.channels.cache
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      position: channel.rawPosition ?? channel.position ?? 0,
    }))
    .sort((a, b) => a.position - b.position);

  categoryCache.set(cacheKey, categories);
  return categories;
}

function getChannelsInCategory(guild, categoryId) {
  const cacheKey = `channels:${guild.id}:${categoryId}`;
  const cached = channelCache.get(cacheKey);
  if (cached) return cached;

  const channels = guild.channels.cache
    .filter((channel) => channel.parentId === categoryId && channel.type !== ChannelType.GuildCategory)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      position: channel.rawPosition ?? channel.position ?? 0,
    }))
    .sort((a, b) => a.position - b.position);

  channelCache.set(cacheKey, channels);
  return channels;
}

async function deleteChannelWithRetry(guild, channelId, retries) {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId));
      if (!channel) return false;
      await channel.delete('Bulk delete from channel manager panel');
      return true;
    } catch (err) {
      attempt += 1;
      if (attempt > retries) return false;
      await sleep(500);
    }
  }
  return false;
}

async function deleteChannels(guild, channelIds, options = {}) {
  const batchSize = options.batchSize || 10;
  const delay = options.delay || 300;
  const retries = options.retries || 2;
  const onProgress = options.onProgress;

  let deleted = 0;
  let failed = 0;

  // Batch deletes to reduce rate limit pressure on large servers.
  const batches = chunk(channelIds, batchSize);
  for (const batch of batches) {
    const results = await Promise.all(
      batch.map((channelId) => deleteChannelWithRetry(guild, channelId, retries))
    );

    results.forEach((success) => {
      if (success) {
        deleted += 1;
      } else {
        failed += 1;
      }
    });

    if (typeof onProgress === 'function') {
      await onProgress({ deleted, total: channelIds.length, failed });
    }

    if (delay) {
      await sleep(delay);
    }
  }

  return { deleted, failed };
}

function clearCategoryCache(guildId, categoryId) {
  const cacheKey = `channels:${guildId}:${categoryId}`;
  channelCache.del(cacheKey);
}

module.exports = {
  getCategories,
  getChannelsInCategory,
  deleteChannels,
  clearCategoryCache,
};

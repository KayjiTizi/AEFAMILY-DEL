const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, REST, Routes } = require('discord.js');
const clusterManager = require('./cluster/clusterManager');
const config = require('./config.json');
require('dotenv').config();

const token = process.env.BOT_TOKEN || config.token;
const clientId = process.env.CLIENT_ID || config.clientId;
const shardCount = Number(process.env.SHARD_COUNT || config.shardCount || 1);

function loadCommandData() {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const command = require(path.join(commandsPath, file));
    if (command?.data?.toJSON) {
      commands.push(command.data.toJSON());
    }
  }
  return commands;
}

async function registerCommands() {
  if (!token || token === 'YOUR_BOT_TOKEN') {
    console.error('[startup] Missing bot token. Set BOT_TOKEN or config.json token.');
    return;
  }
  if (!clientId || clientId === 'YOUR_CLIENT_ID') {
    console.error('[startup] Missing clientId. Set CLIENT_ID or config.json clientId.');
    return;
  }

  const commands = loadCommandData();
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    if (Array.isArray(config.guildIds) && config.guildIds.length > 0) {
      for (const guildId of config.guildIds) {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log(`[startup] Registered commands for guild ${guildId}`);
      }
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('[startup] Registered global commands');
    }
  } catch (err) {
    console.error('[startup] Command registration failed:', err);
  }
}

function loadCommands(client) {
  client.commands = new Collection();
  const commandsPath = path.join(__dirname, 'commands');
  const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const command = require(path.join(commandsPath, file));
    if (command?.data && command?.execute) {
      client.commands.set(command.data.name, command);
    }
  }
}

function loadEvents(client) {
  const eventsPath = path.join(__dirname, 'events');
  const files = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
}

async function startBot({ shardIds, shardCount: totalShards }) {
  if (!token || token === 'YOUR_BOT_TOKEN') {
    console.error('[worker] Missing bot token. Set BOT_TOKEN or config.json token.');
    process.exit(1);
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    shards: shardIds,
    shardCount: totalShards,
  });

  loadCommands(client);
  loadEvents(client);

  try {
    await client.login(token);
  } catch (err) {
    console.error('[worker] Login failed:', err);
    process.exit(1);
  }
}

clusterManager.start({
  shardCount,
  onPrimary: registerCommands,
  onWorker: startBot,
});

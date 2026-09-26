const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    const shards = client.ws.shards.size;
    console.log(`[ready] Logged in as ${client.user.tag} | shards: ${shards}`);
  },
};

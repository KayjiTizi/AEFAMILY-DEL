const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  ChannelType,
} = require('discord.js');
const {
  SESSION_TTL_MS,
  createSession,
  updateSession,
  getSession,
  touchSession,
  endSession,
} = require('../utils/sessionManager');
const {
  getCategories,
  getChannelsInCategory,
  deleteChannels,
  clearCategoryCache,
} = require('../utils/channelManager');
const {
  buildChannelListEmbed,
  buildSelectedChannelsEmbed,
  buildDeletingEmbed,
  buildCompletedEmbed,
  buildPaginationRow,
  disableComponents,
} = require('../utils/pagination');
const { setLastUsedCategory } = require('../database/guildData');
const { logAdminAction } = require('../database/logs');

const CUSTOM_IDS = {
  SELECT_CATEGORY: 'panel:select_category',
  LIST_CHANNELS: 'panel:list_channels',
  DELETE_CHANNELS: 'panel:delete_channels',
  REFRESH: 'panel:refresh',
  CLOSE: 'panel:close',
  CATEGORY_SELECT: 'panel:category_select',
  PREV: 'panel:prev',
  NEXT: 'panel:next',
  SELECT_CHANNELS: 'panel:select_channels',
  CHANNEL_SELECT: 'panel:channel_select',
  DELETE_SELECTED: 'panel:delete_selected',
  DELETE_CATEGORY: 'panel:delete_category',
  DELETE_CATEGORY_CONFIRM: 'panel:delete_category_confirm',
  CANCEL: 'panel:cancel',
};

const PAGE_SIZE = 50;

function buildPanelEmbed(categoryName) {
  const actions = [
    '`select category`',
    '`list channels`',
    '`select channels`',
    '`delete selected`',
    '`delete category channels`',
    '`refresh`',
    '`close`',
  ].join('\n');
  const header = '**channel manager v2**\n\n> manage channels inside a category\n\n';
  const selected = categoryName ? `> selected category: \`${categoryName}\`\n\n` : '';
  return new EmbedBuilder().setDescription(`${header}${selected}actions:\n${actions}`);
}

function buildMainRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.SELECT_CATEGORY)
      .setLabel('select category')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.LIST_CHANNELS)
      .setLabel('list channels')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.DELETE_CHANNELS)
      .setLabel('delete selected')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.SELECT_CHANNELS)
      .setLabel('select channels')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.DELETE_CATEGORY)
      .setLabel('delete category')
      .setStyle(ButtonStyle.Danger)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.REFRESH)
      .setLabel('refresh')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CLOSE)
      .setLabel('close')
      .setStyle(ButtonStyle.Secondary)
  );
  return [row1, row2];
}

function buildCategorySelectRow(categories) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(CUSTOM_IDS.CATEGORY_SELECT)
    .setPlaceholder('select a category')
    .addOptions(
      categories.slice(0, 25).map((category) => ({
        label: category.name,
        value: category.id,
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

function buildChannelSelectRow(channels) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(CUSTOM_IDS.CHANNEL_SELECT)
    .setPlaceholder('select channels to delete')
    .setMinValues(1)
    .setMaxValues(Math.min(25, channels.length))
    .addOptions(
      channels.slice(0, 25).map((channel) => ({
        label: channel.name,
        value: channel.id,
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

function buildConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.DELETE_SELECTED)
      .setLabel('delete selected')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CANCEL)
      .setLabel('cancel')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildDeleteAllConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.DELETE_CATEGORY_CONFIRM)
      .setLabel('delete all in category')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CANCEL)
      .setLabel('cancel')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildDeleteAllConfirmEmbed(categoryName, count) {
  const body = [
    '**delete category channels**',
    '',
    `> category: \`${categoryName}\``,
    `> channels: \`${count}\``,
    '',
    'this will delete all channels in the category and create a log channel with the deleted list.',
  ].join('\n');
  return new EmbedBuilder().setDescription(body);
}

function buildLogLines(channels) {
  return channels.map((channel, index) => {
    const number = String(index + 1).padStart(2, '0');
    return `\`${number}\` ${channel.name}`;
  });
}

function splitLinesIntoMessages({ header, lines, maxLength = 1900 }) {
  const messages = [];
  let current = header || '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength) {
      if (current) messages.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) messages.push(current);
  return messages;
}

async function createDeletionLogChannel(guild, categoryId) {
  const base = 'deleted-channels-log';
  const existingNames = new Set(
    guild.channels.cache
      .filter((channel) => channel.parentId === categoryId && channel.type === ChannelType.GuildText)
      .map((channel) => channel.name)
  );
  let name = base;
  let suffix = 1;
  while (existingNames.has(name) && suffix < 100) {
    name = `${base}-${suffix}`;
    suffix += 1;
  }

  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: categoryId,
    reason: 'Create deletion log channel',
  });
}

async function sendDeletionLog(channel, categoryName, channels) {
  const header = `**deleted channels**\n> category: \`${categoryName}\`\n> deleted: \`${channels.length}\`\n`;
  const lines = buildLogLines(channels);
  const messages = splitLinesIntoMessages({ header, lines });
  for (const content of messages) {
    await channel.send({ content, allowedMentions: { parse: [] } });
  }
}
function getCategoryName(categories, categoryId) {
  return categories.find((category) => category.id === categoryId)?.name || 'unknown';
}

async function sendEphemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload);
  }
  return interaction.reply(payload);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Open advanced channel manager panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const memberPerms = interaction.memberPermissions;
    const hasPermission = memberPerms?.has(PermissionFlagsBits.Administrator);

    if (!hasPermission) {
      return interaction.reply({
        content: '> you do not have permission to use this panel',
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = buildPanelEmbed();
    const response = await interaction.reply({
      embeds: [embed],
      components: buildMainRows(),
      withResponse: true,
    });
    const message = response.resource?.message;
    if (!message) {
      console.error('[panel] Failed to obtain reply message.');
      return;
    }

    const session = createSession({
      messageId: message.id,
      channelId: message.channel.id,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    });

    // Component collector per panel to enforce timeout and avoid leaks.
    const collector = message.createMessageComponentCollector({
      time: SESSION_TTL_MS,
    });

    collector.on('collect', async (componentInteraction) => {
      try {
        if (componentInteraction.user.id !== session.userId) {
          await sendEphemeral(componentInteraction, 'This panel is locked to the command owner.');
          return;
        }

        collector.resetTimer({ time: SESSION_TTL_MS });
        touchSession(message.id);

        if (componentInteraction.isButton()) {
          await handleButton(componentInteraction, message, collector);
        } else if (componentInteraction.isStringSelectMenu()) {
          await handleCategorySelect(componentInteraction, message);
        } else if (componentInteraction.isChannelSelectMenu()) {
          await handleChannelSelect(componentInteraction, message);
        }
      } catch (err) {
        console.error('[panel] interaction error:', err);
        await sendEphemeral(componentInteraction, 'Something went wrong handling this action.');
      }
    });

    collector.on('end', async (collected, reason) => {
      const activeSession = getSession(message.id);
      if (!activeSession) return;

      if (activeSession.state === 'DELETING' || activeSession.state === 'CLOSED' || reason === 'deleting') {
        endSession(message.id);
        return;
      }

      endSession(message.id);

      try {
        const latest = await message.fetch();
        const disabled = disableComponents(latest.components || []);
        await latest.edit({ components: disabled });
      } catch (err) {
        console.error('[panel] failed to disable components:', err);
      }
    });
  },
};

async function handleButton(interaction, message, collector) {
  const session = getSession(message.id);
  if (!session) {
    await sendEphemeral(interaction, 'This panel session has expired.');
    return;
  }

  const guild = interaction.guild;
  const categories = getCategories(guild);

  switch (interaction.customId) {
    case CUSTOM_IDS.SELECT_CATEGORY: {
      if (!categories.length) {
        return sendEphemeral(interaction, 'No categories found in this server.');
      }

      const notice =
        categories.length > 25 ? 'Only the first 25 categories are shown (Discord limit).' : null;

      const categoryRow = buildCategorySelectRow(categories);
      const embed = buildPanelEmbed(session.categoryId ? getCategoryName(categories, session.categoryId) : null);
      await interaction.update({
        embeds: [embed],
        components: [categoryRow, ...buildMainRows()],
      });
      if (notice) {
        await interaction.followUp({ content: notice, flags: MessageFlags.Ephemeral });
      }
      updateSession(message.id, { state: 'SELECT_CATEGORY' });
      return;
    }
    case CUSTOM_IDS.LIST_CHANNELS: {
      if (!session.categoryId) {
        return sendEphemeral(interaction, 'Select a category first.');
      }

      const channelList = getChannelsInCategory(guild, session.categoryId);
      const totalPages = Math.max(1, Math.ceil(channelList.length / PAGE_SIZE));
      const pageIndex = Math.min(session.page, totalPages - 1);
      const offset = pageIndex * PAGE_SIZE;
      const pageItems = channelList.slice(offset, offset + PAGE_SIZE);
      const embed = buildChannelListEmbed({
        categoryName: getCategoryName(categories, session.categoryId),
        pageIndex,
        totalPages,
        channels: pageItems,
        offset,
      });
      const paginationRow = buildPaginationRow({
        disablePrev: pageIndex === 0,
        disableNext: pageIndex === totalPages - 1,
      });

      await interaction.update({
        embeds: [embed],
        components: [paginationRow, ...buildMainRows()],
      });
      updateSession(message.id, { state: 'LIST', page: pageIndex });
      return;
    }
    case CUSTOM_IDS.PREV:
    case CUSTOM_IDS.NEXT: {
      if (!session.categoryId) {
        return sendEphemeral(interaction, 'Select a category first.');
      }

      const channelList = getChannelsInCategory(guild, session.categoryId);
      const totalPages = Math.max(1, Math.ceil(channelList.length / PAGE_SIZE));
      const nextPage =
        interaction.customId === CUSTOM_IDS.NEXT
          ? Math.min(session.page + 1, totalPages - 1)
          : Math.max(session.page - 1, 0);

      const offset = nextPage * PAGE_SIZE;
      const pageItems = channelList.slice(offset, offset + PAGE_SIZE);
      const embed = buildChannelListEmbed({
        categoryName: getCategoryName(categories, session.categoryId),
        pageIndex: nextPage,
        totalPages,
        channels: pageItems,
        offset,
      });
      const paginationRow = buildPaginationRow({
        disablePrev: nextPage === 0,
        disableNext: nextPage === totalPages - 1,
      });

      await interaction.update({
        embeds: [embed],
        components: [paginationRow, ...buildMainRows()],
      });
      updateSession(message.id, { state: 'LIST', page: nextPage });
      return;
    }
    case CUSTOM_IDS.SELECT_CHANNELS: {
      if (!session.categoryId) {
        return sendEphemeral(interaction, 'Select a category first.');
      }

      const channelList = getChannelsInCategory(guild, session.categoryId);
      if (!channelList.length) {
        return sendEphemeral(interaction, 'No channels found in this category.');
      }

      const notice =
        channelList.length > 25
          ? 'Only the first 25 channels are shown (Discord limit). Select, delete, then repeat.'
          : null;

      const selectRow = buildChannelSelectRow(channelList);
      await interaction.update({
        embeds: interaction.message.embeds,
        components: [selectRow, ...buildMainRows()],
      });
      if (notice) {
        await interaction.followUp({ content: notice, flags: MessageFlags.Ephemeral });
      }
      updateSession(message.id, { state: 'SELECT_CHANNELS' });
      return;
    }
    case CUSTOM_IDS.DELETE_CHANNELS: {
      if (!session.selectedChannelIds.length) {
        return sendEphemeral(interaction, 'Select channels first.');
      }

      const selectedChannels = session.selectedChannelIds
        .map((id) => guild.channels.cache.get(id))
        .filter(Boolean)
        .map((channel) => ({ id: channel.id, name: channel.name }));

      await interaction.update({
        embeds: [buildSelectedChannelsEmbed(selectedChannels)],
        components: [buildConfirmRow()],
      });
      updateSession(message.id, { state: 'CONFIRM_DELETE' });
      return;
    }
    case CUSTOM_IDS.DELETE_CATEGORY: {
      if (!session.categoryId) {
        return sendEphemeral(interaction, 'Select a category first.');
      }

      const channelList = getChannelsInCategory(guild, session.categoryId);
      if (!channelList.length) {
        return sendEphemeral(interaction, 'No channels found in this category.');
      }

      const categoryName = getCategoryName(categories, session.categoryId);
      const embed = buildDeleteAllConfirmEmbed(categoryName, channelList.length);
      await interaction.update({
        embeds: [embed],
        components: [buildDeleteAllConfirmRow()],
      });
      updateSession(message.id, { state: 'CONFIRM_DELETE_ALL' });
      return;
    }
    case CUSTOM_IDS.REFRESH: {
      const embed = buildPanelEmbed(session.categoryId ? getCategoryName(categories, session.categoryId) : null);
      await interaction.update({
        embeds: [embed],
        components: buildMainRows(),
      });
      updateSession(message.id, { state: 'MAIN' });
      return;
    }
    case CUSTOM_IDS.CLOSE: {
      updateSession(message.id, { state: 'CLOSED' });
      await interaction.update({
        embeds: [new EmbedBuilder().setDescription('**panel closed**')],
        components: disableComponents(interaction.message.components || []),
      });
      collector.stop('closed');
      endSession(message.id);
      return;
    }
    case CUSTOM_IDS.DELETE_SELECTED: {
      if (!session.selectedChannelIds.length) {
        return sendEphemeral(interaction, 'Select channels first.');
      }

      await interaction.update({
        embeds: [buildDeletingEmbed({ deleted: 0, total: session.selectedChannelIds.length })],
        components: [],
      });

      collector.stop('deleting');
      updateSession(message.id, { state: 'DELETING' });

      const result = await deleteChannels(guild, session.selectedChannelIds, {
        batchSize: 10,
        delay: 300,
        retries: 2,
        onProgress: async ({ deleted, total }) => {
          try {
            await message.edit({
              embeds: [buildDeletingEmbed({ deleted, total })],
            });
          } catch (err) {
            console.error('[panel] progress update failed:', err);
          }
        },
      });

      clearCategoryCache(session.guildId, session.categoryId);
      await message.edit({
        embeds: [buildCompletedEmbed({ deleted: result.deleted })],
        components: [],
      });

      logAdminAction({
        guildId: session.guildId,
        userId: session.userId,
        action: 'delete_channels',
        channelsDeleted: result.deleted,
        categoryId: session.categoryId,
      });

      endSession(message.id);
      return;
    }
    case CUSTOM_IDS.DELETE_CATEGORY_CONFIRM: {
      if (!session.categoryId) {
        return sendEphemeral(interaction, 'Select a category first.');
      }

      const channelList = getChannelsInCategory(guild, session.categoryId);
      if (!channelList.length) {
        return sendEphemeral(interaction, 'No channels found in this category.');
      }

      await interaction.update({
        embeds: [buildDeletingEmbed({ deleted: 0, total: channelList.length })],
        components: [],
      });

      collector.stop('deleting');
      updateSession(message.id, { state: 'DELETING' });

      const result = await deleteChannels(guild, channelList.map((channel) => channel.id), {
        batchSize: 10,
        delay: 300,
        retries: 2,
        onProgress: async ({ deleted, total }) => {
          try {
            await message.edit({
              embeds: [buildDeletingEmbed({ deleted, total })],
            });
          } catch (err) {
            console.error('[panel] progress update failed:', err);
          }
        },
      });

      clearCategoryCache(session.guildId, session.categoryId);

      let logChannel = null;
      try {
        logChannel = await createDeletionLogChannel(guild, session.categoryId);
        await sendDeletionLog(logChannel, getCategoryName(categories, session.categoryId), channelList);
      } catch (err) {
        console.error('[panel] failed to create/send deletion log:', err);
        await interaction.followUp({
          content: 'Deleted channels, but failed to create/send the log channel.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const completedEmbed = new EmbedBuilder().setDescription(
        `**operation completed**\n\n> deleted: \`${result.deleted}\`\n> log: ${
          logChannel ? logChannel.toString() : '`failed to create log`'
        }`
      );

      await message.edit({
        embeds: [completedEmbed],
        components: [],
      });

      logAdminAction({
        guildId: session.guildId,
        userId: session.userId,
        action: 'delete_category_channels',
        channelsDeleted: result.deleted,
        categoryId: session.categoryId,
      });

      endSession(message.id);
      return;
    }
    case CUSTOM_IDS.CANCEL: {
      if (session.state === 'CONFIRM_DELETE_ALL') {
        const embed = buildPanelEmbed(
          session.categoryId ? getCategoryName(categories, session.categoryId) : null
        );
        await interaction.update({
          embeds: [embed],
          components: buildMainRows(),
        });
        updateSession(message.id, { state: 'MAIN' });
        return;
      }
      if (!session.categoryId) {
        const embed = buildPanelEmbed();
        await interaction.update({
          embeds: [embed],
          components: buildMainRows(),
        });
        updateSession(message.id, { state: 'MAIN' });
        return;
      }

      const channelList = getChannelsInCategory(guild, session.categoryId);
      const totalPages = Math.max(1, Math.ceil(channelList.length / PAGE_SIZE));
      const pageIndex = Math.min(session.page, totalPages - 1);
      const offset = pageIndex * PAGE_SIZE;
      const pageItems = channelList.slice(offset, offset + PAGE_SIZE);

      const embed = buildChannelListEmbed({
        categoryName: getCategoryName(categories, session.categoryId),
        pageIndex,
        totalPages,
        channels: pageItems,
        offset,
      });
      const paginationRow = buildPaginationRow({
        disablePrev: pageIndex === 0,
        disableNext: pageIndex === totalPages - 1,
      });

      await interaction.update({
        embeds: [embed],
        components: [paginationRow, ...buildMainRows()],
      });
      updateSession(message.id, { state: 'LIST' });
      return;
    }
    default:
      return;
  }
}

async function handleCategorySelect(interaction, message) {
  const session = getSession(message.id);
  if (!session) {
    return sendEphemeral(interaction, 'This panel session has expired.');
  }

  const categoryId = interaction.values[0];
  updateSession(message.id, { categoryId, page: 0, selectedChannelIds: [], state: 'MAIN' });
  setLastUsedCategory(session.guildId, categoryId);

  const categories = getCategories(interaction.guild);
  const embed = buildPanelEmbed(getCategoryName(categories, categoryId));

  await interaction.update({
    embeds: [embed],
    components: buildMainRows(),
  });
}

async function handleChannelSelect(interaction, message) {
  const session = getSession(message.id);
  if (!session) {
    return sendEphemeral(interaction, 'This panel session has expired.');
  }

  if (!session.categoryId) {
    return sendEphemeral(interaction, 'Select a category first.');
  }

  const channelList = getChannelsInCategory(interaction.guild, session.categoryId);
  const channelMap = new Map(channelList.map((channel) => [channel.id, channel]));

  const selected = interaction.values
    .filter((id) => channelMap.has(id))
    .map((id) => channelMap.get(id));

  if (selected.length === 0) {
    return sendEphemeral(interaction, 'No channels selected in the current category.');
  }

  updateSession(message.id, {
    selectedChannelIds: selected.map((channel) => channel.id),
    state: 'CONFIRM_DELETE',
  });

  const embed = buildSelectedChannelsEmbed(selected);
  await interaction.update({
    embeds: [embed],
    components: [buildConfirmRow()],
  });
}

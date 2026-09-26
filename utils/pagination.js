const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function formatChannelLines(channels, offset = 0) {
  return channels.map((channel, index) => {
    const number = String(offset + index + 1).padStart(2, '0');
    return `\`${number}\` ${channel.name}`;
  });
}

function buildChannelListEmbed({ categoryName, pageIndex, totalPages, channels, offset = 0 }) {
  const header = `**channel list**\n\n> category: \`${categoryName}\`\n> page: \`${pageIndex + 1} / ${totalPages}\`\n\n`;
  const lines = formatChannelLines(channels, offset);
  const body = lines.length ? lines.join('\n') : '_no channels found_';

  return new EmbedBuilder().setDescription(`${header}${body}`);
}

function buildSelectedChannelsEmbed(channels) {
  const header = '**selected channels**\n\n';
  const lines = formatChannelLines(channels, 0);
  const body = lines.length ? lines.join('\n') : '_no channels selected_';
  return new EmbedBuilder().setDescription(`${header}${body}`);
}

function buildDeletingEmbed({ deleted, total }) {
  return new EmbedBuilder().setDescription(
    `**deleting channels**\n\n> progress: \`${deleted} / ${total}\``
  );
}

function buildCompletedEmbed({ deleted }) {
  return new EmbedBuilder().setDescription(`**operation completed**\n\n> deleted: \`${deleted}\``);
}

function buildPaginationRow({ disablePrev, disableNext }) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel:prev')
      .setLabel('previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disablePrev),
    new ButtonBuilder()
      .setCustomId('panel:next')
      .setLabel('next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableNext)
  );
}

function disableComponents(rows) {
  return rows.map((row) => {
    const disabledRow = ActionRowBuilder.from(row);
    disabledRow.components.forEach((component) => component.setDisabled(true));
    return disabledRow;
  });
}

module.exports = {
  buildChannelListEmbed,
  buildSelectedChannelsEmbed,
  buildDeletingEmbed,
  buildCompletedEmbed,
  buildPaginationRow,
  disableComponents,
};

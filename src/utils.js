const TWITCH_LIMIT = 500;

/**
 * Truncate a response to fit Twitch's character limit.
 * Appends '…' if cut short.
 */
export function truncate(text) {
  if (text.length <= TWITCH_LIMIT) return text;
  return text.slice(0, TWITCH_LIMIT - 1) + '…';
}

/**
 * Returns true if the message @-mentions the bot.
 */
export function isMentioned(message, botUsername) {
  const lower = message.toLowerCase();
  const name  = botUsername.toLowerCase();
  return lower.includes('@' + name);
}

/**
 * Returns true if the message is a Twitch reply to one of the bot's messages.
 * tmi.js exposes reply metadata in tags:
 *   tags['reply-parent-user-login'] — username of the message being replied to
 */
export function isReplyToBot(tags, botUsername) {
  const parent = tags['reply-parent-user-login'];
  return !!parent && parent.toLowerCase() === botUsername.toLowerCase();
}

/**
 * Strip the @BotName mention from the start of a message so the AI
 * only sees the actual question.
 */
export function stripMention(message, botUsername) {
  return message.replace(new RegExp('@' + botUsername, 'gi'), '').trim();
}

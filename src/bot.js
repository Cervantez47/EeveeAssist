import tmi from 'tmi.js';
import { isMentioned, isReplyToBot, stripMention, truncate } from './utils.js';
import { searchCardsByName, groupBySet, formatPrices } from './pokemon.js';
import { askAI, askSetClarification } from './ai.js';

const BOT_USERNAME = process.env.TWITCH_BOT_USERNAME;
const CHANNEL      = process.env.TWITCH_CHANNEL;

// Track message IDs sent by the bot so we can detect replies to them
// Entries expire after 10 minutes to prevent unbounded growth
const botMessageIds = new Map(); // msgId -> timestamp
const MSG_TTL_MS    = 10 * 60 * 1000;

function pruneBotMessages() {
  const cutoff = Date.now() - MSG_TTL_MS;
  for (const [id, ts] of botMessageIds) {
    if (ts < cutoff) botMessageIds.delete(id);
  }
}

export function createClient() {
  const client = new tmi.Client({
    identity: {
      username: BOT_USERNAME,
      password: process.env.TWITCH_OAUTH_TOKEN,
    },
    channels: [CHANNEL],
  });

  client.on('message', async (channel, tags, message, self) => {
    if (self) return; // ignore bot's own messages

    const mentioned   = isMentioned(message, BOT_USERNAME);
    const replyToBot  = isReplyToBot(tags, BOT_USERNAME);

    if (!mentioned && !replyToBot) return;

    pruneBotMessages();

    const query    = stripMention(message, BOT_USERNAME);
    const username = tags['display-name'] || tags.username;

    if (!query) {
      const reply = truncate(`@${username} Hey! Ask me about any Pokémon TCG card and I'll look it up for you! 🃏`);
      sendReply(client, channel, tags, reply);
      return;
    }

    try {
      const response = await handleQuery(query, username);
      sendReply(client, channel, tags, truncate(response));
    } catch (err) {
      console.error('Error handling query:', err);
      sendReply(client, channel, tags, truncate(`@${username} Sorry, something went wrong! Try again in a moment.`));
    }
  });

  // Capture bot's own message IDs when they are sent
  client.on('message', (channel, tags, message, self) => {
    if (self && tags.id) {
      botMessageIds.set(tags.id, Date.now());
    }
  });

  return client;
}

async function handleQuery(query, username) {
  // Try to extract a Pokémon name from the query (naive: use the full query as search term)
  const cards = await searchCardsByName(query);

  if (!cards.length) {
    // No cards found — let Claude respond (may be off-topic, which the system prompt handles)
    return await askAI(query);
  }

  const bySet    = groupBySet(cards);
  const setNames = Object.keys(bySet);

  if (setNames.length > 1) {
    // Multiple sets — ask for clarification
    return await askSetClarification(query, setNames);
  }

  // Single set found — use the first (most relevant) card
  const card       = cards[0];
  const priceStr   = formatPrices(card);
  return await askAI(`@${username} asked: "${query}"`, card, priceStr);
}

function sendReply(client, channel, tags, text) {
  // Use Twitch reply thread if this was a reply, otherwise @-mention
  if (tags['reply-parent-msg-id']) {
    client.reply(channel, text, tags['reply-parent-msg-id']);
  } else {
    client.say(channel, text);
  }
}

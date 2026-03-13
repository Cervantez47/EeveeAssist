import tmi from 'tmi.js';
import { isMentioned, isReplyToBot, stripMention, truncate } from './utils.js';
import { searchCardsByName, groupBySet, formatPrices } from './pokemon.js';
import { askAI, askSetClarification } from './ai.js';

const BOT_USERNAME = process.env.TWITCH_BOT_USERNAME;
const CHANNEL      = process.env.TWITCH_CHANNEL;

// ── Conversation history per user ─────────────────────────────────────────────
// Keeps the last MAX_HISTORY exchanges so follow-up replies have context.
// Entries expire after HISTORY_TTL_MS of inactivity.
const MAX_HISTORY    = 3;   // number of back-and-forth exchanges to remember
const HISTORY_TTL_MS = 5 * 60 * 1000; // 5 minutes

const userHistory = new Map(); // username -> { turns: [{role,content}], lastActive }

function getHistory(username) {
  const entry = userHistory.get(username);
  if (!entry) return [];
  if (Date.now() - entry.lastActive > HISTORY_TTL_MS) {
    userHistory.delete(username);
    return [];
  }
  return entry.turns;
}

function appendHistory(username, userMsg, assistantMsg) {
  const turns = getHistory(username);
  turns.push({ role: 'user',      content: userMsg      });
  turns.push({ role: 'assistant', content: assistantMsg });
  // Keep only the last MAX_HISTORY exchanges (2 messages each)
  const trimmed = turns.slice(-(MAX_HISTORY * 2));
  userHistory.set(username, { turns: trimmed, lastActive: Date.now() });
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
    console.log(`[msg] self=${self} user=${tags.username} msg=${message}`);
    if (self) return;

    const mentioned  = isMentioned(message, BOT_USERNAME);
    const replyToBot = isReplyToBot(tags, BOT_USERNAME);
    console.log(`[trigger] mentioned=${mentioned} replyToBot=${replyToBot}`);

    if (!mentioned && !replyToBot) return;

    const query    = stripMention(message, BOT_USERNAME);
    const username = tags['display-name'] || tags.username;

    if (!query) {
      sendReply(client, channel, `@${username} Hey! Ask me about any Pokémon TCG card and I'll look it up for you! 🃏`);
      return;
    }

    try {
      const history  = getHistory(username);
      const response = await handleQuery(query, username, history);
      const reply    = truncate(response);
      appendHistory(username, query, reply);
      sendReply(client, channel, reply);
    } catch (err) {
      console.error('Error handling query:', err);
      sendReply(client, channel, `@${username} Sorry, something went wrong! Try again in a moment.`);
    }
  });

  return client;
}

async function handleQuery(query, username, history) {
  // Try the card API — fall back to Claude's own knowledge if unavailable
  try {
    const cards = await searchCardsByName(query);

    if (cards.length) {
      const bySet    = groupBySet(cards);
      const setNames = Object.keys(bySet);

      if (setNames.length > 1) {
        return await askSetClarification(query, setNames);
      }

      const card     = cards[0];
      const priceStr = formatPrices(card);
      return await askAI(`@${username} asked: "${query}"`, card, priceStr, history);
    }
  } catch (err) {
    console.warn('[pokemon api] unavailable, falling back to AI knowledge:', err.message);
  }

  // API unavailable or no results — let Claude answer from its training knowledge
  return await askAI(query, null, '', history);
}

function sendReply(client, channel, text) {
  client.say(channel, text);
}

import tmi from 'tmi.js';
import { isMentioned, isReplyToBot, stripMention, truncate } from './utils.js';
import { searchCardsByName, groupBySet, formatPrices } from './pokemon.js';
import { askAI, askSetClarification, announceSpawn } from './ai.js';
import { broadcastPokemon } from './overlay.js';

const BOT_USERNAME  = process.env.TWITCH_BOT_USERNAME;
const CHANNEL       = process.env.TWITCH_CHANNEL;
const SPAWN_BOT     = 'pokemoncommunitygame';

// ── Overlay deduplication ──────────────────────────────────────────────────────
// Tracks the last Pokémon shown on the overlay per user so we never show the
// same Pokémon twice in a row for the same person. Resets after HISTORY_TTL_MS
// of inactivity (matching the conversation history TTL).
const userLastImagePokemon = new Map(); // username -> { name, lastActive }

function getLastImagePokemon(username) {
  const entry = userLastImagePokemon.get(username);
  if (!entry) return null;
  if (Date.now() - entry.lastActive > HISTORY_TTL_MS) {
    userLastImagePokemon.delete(username);
    return null;
  }
  return entry.name;
}

function setLastImagePokemon(username, pokemonName) {
  userLastImagePokemon.set(username, { name: pokemonName, lastActive: Date.now() });
}

/**
 * Try to identify a Pokémon name in a chat message by validating candidate
 * words against PokeAPI. Returns { id, name } on a match, otherwise null.
 * Tries individual words then hyphenated adjacent pairs (e.g. "tapu-koko").
 */
async function extractPokemonFromQuery(message) {
  const normalized = message.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const words = normalized.split(/\s+/).filter(w => w.length >= 3);

  // Single words + adjacent pairs joined with "-" (covers Mr. Mime, Ho-Oh, etc.)
  const candidates = [
    ...words,
    ...words.slice(0, -1).map((w, i) => `${w}-${words[i + 1]}`),
  ];

  for (const candidate of candidates) {
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${candidate}`);
      if (res.ok) {
        const data = await res.json();
        return { id: data.id, name: data.name };
      }
    } catch { /* network hiccup — skip */ }
  }
  return null;
}

/**
 * Extract the Pokémon name from a PokemonCommunityGame spawn message.
 * The bot posts messages like: "A wild Pikachu has appeared in the chat! ..."
 * Returns null if the message isn't a spawn announcement.
 */
function parseSpawnMessage(message) {
  const match = message.match(/a wild (.+?) (?:has )?appear(?:s|ed)/i);
  return match ? match[1].trim() : null;
}

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

    // ── Pokémon Community Game spawn announcements ─────────────────────────────
    if (tags.username?.toLowerCase() === SPAWN_BOT) {
      const pokemonName = parseSpawnMessage(message);
      if (pokemonName) {
        console.log(`[spawn] ${pokemonName} appeared`);
        try {
          const blurb = await announceSpawn(pokemonName);
          if (blurb) sendReply(client, channel, blurb);
        } catch (err) {
          console.error('[spawn] Error announcing spawn:', err);
        }
      }
      return;
    }

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

      // ── Overlay: show the queried Pokémon image ──────────────────────────────
      // Run in background — never block the chat reply for this
      extractPokemonFromQuery(query).then(pokemon => {
        if (!pokemon) return;
        const last = getLastImagePokemon(username);
        if (pokemon.name === last) return; // same Pokémon — don't show again
        setLastImagePokemon(username, pokemon.name);
        broadcastPokemon(pokemon.id, pokemon.name);
      }).catch(err => console.error('[overlay] extraction error:', err));

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

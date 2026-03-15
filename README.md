# EeveeAssist

A Twitch chatbot powered by Claude AI that answers general Pokémon knowledge questions and provides card pricing when asked. Also integrates with the Pokémon Community Game to auto-announce Pokémon spawns in chat, and drives a live OBS overlay showing Pokémon artwork.

---

## Features

- Responds when mentioned via `@EeveeAssist` or when a chatter replies to the bot's message
- **Default mode**: General Pokémon knowledge (types, evolutions, moves, lore, Pokédex info) — 120-character responses
- **Card value mode**: Activates only when a chatter explicitly asks about price, value, or worth — up to 500-character responses with Scrydex TCG API data + Brave web search
- Conversational memory per user — follow-up questions like "what about Charmander?" work naturally (5-minute TTL, 3 exchanges)
- Auto-announces Pokémon Community Game spawns: detects `pokemoncommunitygame` bot messages, posts a fun fact about the spawned Pokémon (120 chars)
- Drives an OBS overlay via SSE — shows official Pokémon artwork + name when a chatter asks about a Pokémon
- Politely declines off-topic queries

---

## Project Structure

```
EeveeAssist/
├── README.md
├── STREAMELEMENTS.md         # notes for future StreamElements migration
├── .env                      # secrets (not committed)
├── .env.example              # template for required env vars
├── package.json
├── Dockerfile
├── railway.json
├── src/
│   ├── index.js              # entry point — starts bot + overlay SSE server
│   ├── bot.js                # tmi.js Twitch client, message routing, spawn detection
│   ├── ai.js                 # Claude API integration, prompt building, spawn announcements
│   ├── pokemon.js            # Scrydex TCG API wrapper (card lookup, market value)
│   ├── search.js             # Brave Search API wrapper (web search tool for Claude)
│   ├── overlay.js            # HTTP SSE server — broadcasts Pokémon query events to OBS
│   └── utils.js              # truncate, mention detection, reply detection helpers
└── prompts/
    └── system.md             # Claude system prompt — persona, scope, response rules
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
TWITCH_BOT_USERNAME=      # bot account username (EeveeAssist)
TWITCH_OAUTH_TOKEN=       # oauth:xxxx from twitchapps.com/tmi
TWITCH_CHANNEL=           # channel to join (without #)
ANTHROPIC_API_KEY=        # Claude API key
POKEMON_TCG_API_KEY=      # Scrydex API key
POKEMON_TCG_TEAM_ID=      # Scrydex team ID
BRAVE_SEARCH_API_KEY=     # Brave Search API key (for web search tool)
PORT=3001                 # overlay SSE server port (Railway sets this automatically)
```

---

## Tech Stack

| Layer | Library / Service |
|---|---|
| Twitch chat | [tmi.js](https://tmijs.com/) |
| AI responses | Anthropic Claude API (`claude-haiku-4-5-20251001`) |
| Card data & prices | [Scrydex API](https://api.scrydex.com/pokemon/v1) |
| Web search | [Brave Search API](https://api.search.brave.com) |
| Pokémon name/ID lookup | [PokeAPI](https://pokeapi.co/) |
| Overlay push | Node.js built-in `http` — SSE (`/events` endpoint) |
| Runtime | Node.js 20+ |

---

## Message Flow

```
Chatter message
      │
      ├─ From pokemoncommunitygame? ──Yes──▶ parse spawn, post fun fact in chat
      │
      ├─ @mention or reply to bot? ──No──▶ ignore
      │
      Yes
      │
      ▼
 bot.js — does query mention price/value/card keywords?
      │
      ├─ Yes ──▶ pokemon.js (Scrydex) — fetch card + price
      │               │
      │               ▼
      │          ai.js — Claude with card context (≤500 chars)
      │
      └─ No ──▶ ai.js — Claude general Pokémon knowledge (≤120 chars)
                    │
                    ▼
               utils.js — truncate to limit
                    │
                    ▼
               bot.js — send reply to Twitch chat
                    │
                    ▼
               overlay.js — extract Pokémon name via PokeAPI,
                            broadcast to OBS overlay (per-user dedup)
```

---

## OBS Overlay

EeveeAssist runs an HTTP server (same process as the bot) with two endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /events` | SSE stream — pushes `{ id, name }` when a Pokémon is queried |
| `GET /health` | Railway health check |

The overlay lives in the [`poke-community-overlay`](https://github.com/Cervantez47/poke-community-overlay) repo.

### OBS Browser Sources

| Source | URL |
|---|---|
| Spawn overlay | `https://cervantez47.github.io/poke-community-overlay/` |
| EeveeAssist query overlay | `https://cervantez47.github.io/poke-community-overlay/eeveeassist.html?server=https://eeveeassist-production.up.railway.app` |

- Both sources: 320px image, positioned `top: 100px / left: 200px`
- Spawn overlay: shows official Pokémon artwork + "A WILD [NAME] HAS APPEARED IN CHAT!" during the 90-second catch window; fetches name from PokeAPI by Pokédex ID
- EeveeAssist overlay: fades in for 8 seconds when a chatter queries a Pokémon; per-user dedup prevents repeat shows for the same Pokémon within 5 minutes

---

## Deployment

Hosted on [Railway](https://railway.app) — auto-deploys on push to `main`.

- **Service URL**: `https://eeveeassist-production.up.railway.app`
- **Port**: Railway injects `PORT` automatically (configured as 8080 in the dashboard)
- **Source**: `Cervantez47/EeveeAssist` → `main` branch

```bash
# Local dev
npm install
cp .env.example .env
# fill in .env values, set PORT=3001
npm run dev
```

---

## Response Behavior

| Query type | Example | Response limit | Data source |
|---|---|---|---|
| General Pokémon | "What type is Garchomp?" | 120 chars | Claude training knowledge |
| Follow-up | "What about its evolution?" | 120 chars | Claude + conversation history |
| Card value | "How much is a Charizard worth?" | 500 chars | Scrydex API + Brave Search |
| Spawn announcement | *(auto, from PCG bot)* | 120 chars | Claude training knowledge |
| Off-topic | "What's the weather?" | — | Polite decline |

---

## StreamElements Integration (Future)

See [`STREAMELEMENTS.md`](STREAMELEMENTS.md) for notes on migrating both overlays to StreamElements Custom Widgets.

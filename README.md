# EeveeAssist

A Twitch chatbot powered by Claude AI that answers questions about Pokémon Trading Card Game cards — including set identification, card details, and approximate market values.

---

## Features

- Responds when mentioned via `@EeveeAssist` or when a chatter replies to the bot's message
- Stays strictly on-topic: Pokémon TCG only — politely declines all other subjects
- Asks clarifying set questions (e.g. *"Are you asking about Pikachu from Prismatic Evolutions or Base Set?"*)
- Provides approximate market value for specific card printings
- All responses capped at Twitch's 500-character limit

---

## Project Structure

```
EeveeAssist/
├── README.md
├── .env                  # secrets (not committed)
├── .env.example          # template for required env vars
├── package.json
├── src/
│   ├── index.js          # entry point — starts the bot
│   ├── bot.js            # tmi.js Twitch client, message routing
│   ├── ai.js             # Claude API integration, prompt building
│   ├── pokemon.js        # Pokémon TCG API wrapper (card lookup, market value)
│   └── utils.js          # truncate to 500 chars, mention detection, helpers
└── prompts/
    └── system.md         # Claude system prompt — persona + scope guardrails
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
TWITCH_BOT_USERNAME=      # bot account username
TWITCH_OAUTH_TOKEN=       # oauth:xxxx from twitchapps.com/tmi
TWITCH_CHANNEL=           # channel to join (without #)
ANTHROPIC_API_KEY=        # Claude API key
POKEMON_TCG_API_KEY=      # api.pokemontcg.io key (free tier available)
BOT_USERNAME=             # same as TWITCH_BOT_USERNAME, used for @-detection
```

---

## Tech Stack

| Layer | Library |
|---|---|
| Twitch chat | [tmi.js](https://tmijs.com/) |
| AI responses | [Anthropic Claude API](https://docs.anthropic.com/) (`claude-haiku-4-5`) |
| Card data & prices | [Pokémon TCG API](https://pokemontcg.io/) |
| Runtime | Node.js 20+ |

---

## Flow

```
Chatter message
      │
      ├─ @mention or reply to bot? ──No──▶ ignore
      │
      Yes
      │
      ▼
 pokemon.js — search card by name
      │
      ├─ Multiple sets found? ──Yes──▶ ai.js builds clarifying question
      │
      No (or set already known)
      │
      ▼
 pokemon.js — fetch market price (TCGPlayer mid)
      │
      ▼
 ai.js — build prompt with card context + price
      │
      ▼
 Claude API ──▶ response
      │
      ▼
 utils.js — truncate to ≤500 chars
      │
      ▼
 bot.js — send reply to Twitch chat
```

---

## Response Guardrails

- **Off-topic queries**: *"Sorry, I only know about Pokémon TCG! Ask me about a card and I'll look it up. 🃏"*
- **Unknown card**: *"I couldn't find that card — can you double-check the name or tell me which set it's from?"*
- **Character limit**: Hard truncated at 497 chars with `…` appended if needed

---

## Getting Started

```bash
npm install
cp .env.example .env
# fill in .env values
npm start
```

---

## Roadmap

- [ ] Core bot scaffolding (`bot.js`, `index.js`)
- [ ] Claude integration with system prompt (`ai.js`, `prompts/system.md`)
- [ ] Pokémon TCG API wrapper with market value (`pokemon.js`)
- [ ] Set disambiguation / clarifying question logic
- [ ] Reply-chain tracking (respond to replies to bot messages)
- [ ] 500-char truncation utility (`utils.js`)
- [ ] `.env.example` and deployment notes

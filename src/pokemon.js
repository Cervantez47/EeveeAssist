// Pokémon TCG API wrapper — Scrydex
// Docs: https://api.scrydex.com/pokemon/v1
// English-scoped endpoint used throughout (/en/).

const BASE_URL = 'https://api.scrydex.com/pokemon/v1/en';

function headers() {
  const h = {};
  if (process.env.POKEMON_TCG_API_KEY) h['X-Api-Key']  = process.env.POKEMON_TCG_API_KEY;
  if (process.env.POKEMON_TCG_TEAM_ID) h['X-Team-ID']  = process.env.POKEMON_TCG_TEAM_ID;
  return h;
}

/**
 * Search for cards by Pokémon name.
 * Returns an array of card objects (may span multiple sets).
 * Prices are opt-in via include=prices.
 */
export async function searchCardsByName(pokemonName) {
  const query  = encodeURIComponent(`name:"${pokemonName}"`);
  const select = 'id,name,expansion,rarity,number,variants';
  const url    = `${BASE_URL}/cards?q=${query}&select=${select}&include=prices&page_size=20`;

  const res  = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Scrydex API error: ${res.status}`);
  const json = await res.json();
  // Scrydex may return { data: [...] } or a top-level array
  return json.data ?? (Array.isArray(json) ? json : []);
}

/**
 * Fetch a single card by its full ID (e.g. "base1-4").
 * Prices are opt-in.
 */
export async function getCardById(cardId) {
  const url = `${BASE_URL}/cards/${encodeURIComponent(cardId)}?include=prices`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Scrydex API error: ${res.status}`);
  const json = await res.json();
  return json.data ?? json ?? null;
}

/**
 * Extract a human-readable market price string from a card's variants array.
 * Scrydex stores prices inside variants[].prices.
 * Returns e.g. "Unlimited Holofoil: ~$4.50 | 1st Ed: ~$120.00" or "Price unavailable"
 */
export function formatPrices(card) {
  const variants = card?.variants;
  if (!variants?.length) return 'Price unavailable';

  const lines = [];
  for (const variant of variants) {
    if (!variant.prices?.length) continue;
    // Pick the first price entry that has a market or mid value
    for (const priceEntry of variant.prices) {
      const value = priceEntry.market ?? priceEntry.mid ?? priceEntry.average;
      if (value == null) continue;
      const label = variant.name.replace(/([A-Z])/g, ' $1').trim();
      lines.push(`${label}: ~$${Number(value).toFixed(2)}`);
      break; // one price per variant is enough
    }
  }

  return lines.length ? lines.join(' | ') : 'Price unavailable';
}

/**
 * Group an array of cards by expansion name.
 * Returns { expansionName: [card, ...], ... }
 */
export function groupBySet(cards) {
  return cards.reduce((acc, card) => {
    const key = card.expansion?.name ?? 'Unknown Set';
    (acc[key] ??= []).push(card);
    return acc;
  }, {});
}

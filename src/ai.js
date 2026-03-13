import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir      = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dir, '../prompts/system.md'), 'utf8');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Build a card context string to inject alongside the user's question.
 * cardData may be null (no specific card found) or a card object from pokemon.js.
 */
function buildCardContext(cardData, priceString) {
  if (!cardData) return '';
  return `\nCARD: ${cardData.name} | SET: ${cardData.expansion?.name} | RARITY: ${cardData.rarity ?? 'Unknown'} | NUMBER: ${cardData.number}/${cardData.expansion?.printed_total ?? '?'} | PRICES: ${priceString}`;
}

/**
 * Ask Claude a question, optionally with card context injected.
 * Returns the response string, already trimmed.
 */
export async function askAI(userMessage, cardData = null, priceString = '') {
  const cardContext = buildCardContext(cardData, priceString);
  const userContent = cardContext
    ? `${userMessage}\n\n[Card data for context:${cardContext}]`
    : userMessage;

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userContent }],
  });

  return message.content[0]?.text?.trim() ?? '';
}

/**
 * Ask Claude to generate a set-disambiguation question.
 * setNames is an array of set name strings the card was found in.
 */
export async function askSetClarification(pokemonName, setNames) {
  const setList = setNames.slice(0, 5).join(', ');
  const prompt  = `A user asked about "${pokemonName}" without specifying a set. It appears in these sets: ${setList}. Ask them a brief, friendly clarifying question to find out which printing they mean.`;

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 120,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: prompt }],
  });

  return message.content[0]?.text?.trim() ?? '';
}

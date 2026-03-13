import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { braveSearch } from './search.js';

const __dir       = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dir, '../prompts/system.md'), 'utf8');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Tool definition Claude can call to search the web
const TOOLS = [
  {
    name: 'search_web',
    description: 'Search the web for current Pokémon TCG card prices, recent set releases, or specific card details. Use this when you need up-to-date pricing or info about cards released after your training data.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query, e.g. "Charizard Base Set shadowless TCGPlayer price 2025"',
        },
      },
      required: ['query'],
    },
  },
];

/**
 * Build a card context string to inject alongside the user's question.
 */
function buildCardContext(cardData, priceString) {
  if (!cardData) return '';
  return `\nCARD: ${cardData.name} | SET: ${cardData.expansion?.name} | RARITY: ${cardData.rarity ?? 'Unknown'} | NUMBER: ${cardData.number}/${cardData.expansion?.printed_total ?? '?'} | PRICES: ${priceString}`;
}

/**
 * Ask Claude a question with optional card context, conversation history,
 * and web search tool access. Handles the tool-use loop automatically.
 * Returns the final response string.
 */
export async function askAI(userMessage, cardData = null, priceString = '', history = []) {
  const cardContext = buildCardContext(cardData, priceString);
  const userContent = cardContext
    ? `${userMessage}\n\n[Card data for context:${cardContext}]`
    : userMessage;

  const messages = [
    ...history,
    { role: 'user', content: userContent },
  ];

  // Tool-use loop — max 2 search rounds to keep latency reasonable
  for (let round = 0; round < 2; round++) {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system:     systemPrompt,
      tools:      TOOLS,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text?.trim() ?? '';
    }

    if (response.stop_reason === 'tool_use') {
      // Add Claude's response (with tool_use blocks) to the message thread
      messages.push({ role: 'assistant', content: response.content });

      // Execute each tool call and collect results
      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        let output;
        try {
          if (block.name === 'search_web') {
            console.log(`[search] ${block.input.query}`);
            output = await braveSearch(block.input.query);
          } else {
            output = 'Unknown tool.';
          }
        } catch (err) {
          output = `Search failed: ${err.message}`;
        }
        toolResults.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     output,
        });
      }

      // Feed results back to Claude
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop reason — return whatever text we have
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text?.trim() ?? '';
  }

  // Fallback if loop exhausts without end_turn
  return 'Sorry, I had trouble looking that up — try again in a moment!';
}

/**
 * When a card exists across multiple sets, lead with the most notable printing
 * and its price, then mention other versions exist.
 * Reuses askAI so Claude can search the web if needed.
 */
export async function askSetClarification(pokemonName, setNames) {
  const setList = setNames.slice(0, 8).join(', ');
  const prompt  = `A user asked about "${pokemonName}" without specifying a set. It appears in these sets: ${setList}. Lead with the most popular, valuable, or sought-after version and its approximate market price. Then briefly note other versions exist and offer to look them up.`;
  return await askAI(prompt);
}

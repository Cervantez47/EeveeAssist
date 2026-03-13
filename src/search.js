// Brave Search API wrapper
// Docs: https://api.search.brave.com/app/documentation/web-search
// Free tier: 2,000 queries/month

const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';

/**
 * Search the web via Brave Search.
 * Returns a plain-text summary of the top results suitable for Claude to parse.
 */
export async function braveSearch(query) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key || key === 'your_brave_search_api_key') {
    throw new Error('BRAVE_SEARCH_API_KEY not configured');
  }

  const url = `${BRAVE_URL}?q=${encodeURIComponent(query)}&count=5&search_lang=en&safesearch=moderate`;

  const res = await fetch(url, {
    headers: {
      'Accept':             'application/json',
      'Accept-Encoding':    'gzip',
      'X-Subscription-Token': key,
    },
  });

  if (!res.ok) throw new Error(`Brave Search error: ${res.status}`);

  const json = await res.json();
  const results = json.web?.results ?? [];

  if (!results.length) return 'No results found.';

  // Summarise into plain text Claude can reason over
  return results.map((r, i) =>
    `[${i + 1}] ${r.title}\n${r.description ?? ''}\nURL: ${r.url}`
  ).join('\n\n');
}

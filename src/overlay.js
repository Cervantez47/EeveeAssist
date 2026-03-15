import { createServer } from 'http';

const clients = new Set(); // active SSE response objects

/**
 * Start an HTTP server that exposes an SSE endpoint at GET /events.
 * The overlay HTML connects here to receive real-time Pokémon query events.
 */
export function startOverlayServer(port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost`);

    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type':                'text/event-stream',
        'Cache-Control':               'no-cache',
        'Connection':                  'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      // Tell the browser to reconnect after 3s if connection drops
      res.write('retry: 3000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    // Simple health check endpoint for Railway
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, () =>
    console.log(`[overlay] SSE server listening on :${port}`)
  );
}

/**
 * Push a Pokémon event to all connected overlay clients.
 * @param {number} id   - National Pokédex ID
 * @param {string} name - Pokémon name (lowercase, as returned by PokeAPI)
 */
export function broadcastPokemon(id, name) {
  if (!clients.size) return;
  const data = JSON.stringify({ id, name });
  for (const client of clients) {
    client.write(`data: ${data}\n\n`);
  }
  console.log(`[overlay] broadcast ${name} (#${id}) → ${clients.size} client(s)`);
}

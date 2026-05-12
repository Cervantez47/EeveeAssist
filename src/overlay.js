import { createServer } from 'http';
import { generateSubMessage } from './ai.js';

const clients = new Set(); // active SSE response objects

const VALID_SUB_TYPES = new Set(['sub', 'resub', 'giftsub', 'communitygift', 'prime']);

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req, maxBytes = 8192) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function handleSubEvent(req, res) {
  const secret = process.env.SUB_EVENT_SECRET;
  if (!secret) {
    return sendJson(res, 503, { error: 'SUB_EVENT_SECRET not configured' });
  }
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${secret}`) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: `Invalid JSON body: ${err.message}` });
  }

  if (!body || typeof body !== 'object') {
    return sendJson(res, 400, { error: 'Body must be a JSON object' });
  }
  if (!VALID_SUB_TYPES.has(body.type)) {
    return sendJson(res, 400, { error: `type must be one of: ${[...VALID_SUB_TYPES].join(', ')}` });
  }
  if (!body.userName || typeof body.userName !== 'string') {
    return sendJson(res, 400, { error: 'userName is required' });
  }
  if (body.type === 'giftsub' && !body.recipientUser) {
    return sendJson(res, 400, { error: 'recipientUser is required for giftsub' });
  }

  try {
    const message = await generateSubMessage(body);
    console.log(`[sub-event] ${body.type} ${body.userName} -> ${message}`);
    return sendJson(res, 200, { message });
  } catch (err) {
    console.error('[sub-event] generation failed:', err);
    return sendJson(res, 500, { error: 'Generation failed' });
  }
}

/**
 * Start an HTTP server that exposes an SSE endpoint at GET /events.
 * The overlay HTML connects here to receive real-time Pokémon query events.
 */
export function startOverlayServer(port) {
  const server = createServer(async (req, res) => {
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

    // Sub-event message generation for Streamer.bot. POST JSON, returns text.
    if (url.pathname === '/sub-event' && req.method === 'POST') {
      await handleSubEvent(req, res);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, () =>
    console.log(`[overlay] HTTP server listening on :${port}`)
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

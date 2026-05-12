import 'dotenv/config';
import { createClient } from './bot.js';
import { startOverlayServer } from './overlay.js';

const required = [
  'TWITCH_BOT_USERNAME',
  'TWITCH_OAUTH_TOKEN',
  'TWITCH_CHANNEL',
  'ANTHROPIC_API_KEY',
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const client = createClient();

startOverlayServer(process.env.PORT || 3001, client);

client.connect()
  .then(() => console.log(`EeveeAssist connected to #${process.env.TWITCH_CHANNEL}`))
  .catch(err => {
    console.error('Failed to connect:', err);
    process.exit(1);
  });

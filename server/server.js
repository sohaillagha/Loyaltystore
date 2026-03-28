import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import customerRoutes from './routes/customers.js';
import syncRoutes from './routes/sync.js';
import aiRoutes from './routes/ai.js';
import chatRoutes from './routes/chat.js';
import { getDb } from './db/database.js';
import { runSync } from './services/syncService.js';
import { recalculateAllLoyalty } from './services/loyaltyEngine.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize DB on startup
getDb();

// Routes
app.use('/api/customers', customerRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React build in production
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`\n🚀 Loyalty CRM Server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard API: http://localhost:${PORT}/api/customers/stats`);
  console.log(`🔄 Sync endpoint: POST http://localhost:${PORT}/api/sync`);
  console.log(`💬 Chat endpoint: POST http://localhost:${PORT}/api/chat/start`);
  console.log(`\n💡 Run sync first: curl -X POST http://localhost:${PORT}/api/sync\n`);

  // Auto-sync on startup in production
  if (process.env.AUTO_SYNC === 'true') {
    console.log('🔄 Auto-syncing data on startup...');
    try {
      await runSync();
      recalculateAllLoyalty();
      console.log('✅ Auto-sync complete!');
    } catch (err) {
      console.error('Auto-sync failed:', err.message);
    }
  }
});


import { Router } from 'express';
import { runSync } from '../services/syncService.js';
import { recalculateAllLoyalty } from '../services/loyaltyEngine.js';

const router = Router();

// POST /api/sync - Sync WooCommerce data
router.post('/', async (req, res) => {
  try {
    const syncResult = await runSync();
    const tierResult = recalculateAllLoyalty();
    res.json({
      success: true,
      message: 'Sync complete',
      data: { ...syncResult, tiers: tierResult }
    });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/loyalty/recalculate
router.post('/loyalty/recalculate', (req, res) => {
  try {
    const result = recalculateAllLoyalty();
    res.json({ success: true, tiers: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

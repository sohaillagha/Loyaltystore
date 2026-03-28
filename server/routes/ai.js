import { Router } from 'express';
import { getDb } from '../db/database.js';
import { generateCustomerSummary, generateEmailDraft, generateNextBestAction, explainScore } from '../services/aiService.js';
import { getCustomerLoyaltyBreakdown } from '../services/loyaltyEngine.js';

const router = Router();

// POST /api/ai/summary/:id
router.post('/summary/:id', async (req, res) => {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const orders = db.prepare(
      'SELECT * FROM orders WHERE customer_id = ? ORDER BY date DESC'
    ).all(req.params.id);

    const summary = await generateCustomerSummary(customer, orders);
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/email/:id
router.post('/email/:id', async (req, res) => {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const email = await generateEmailDraft(customer);
    res.json(email);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/action/:id
router.post('/action/:id', async (req, res) => {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const action = await generateNextBestAction(customer);
    res.json({ action });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/explain-score/:id
router.post('/explain-score/:id', async (req, res) => {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const breakdown = getCustomerLoyaltyBreakdown(customer.id);
    const explanation = await explainScore(customer, breakdown);
    res.json({ explanation, breakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


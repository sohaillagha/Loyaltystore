import { Router } from 'express';
import { getDb } from '../db/database.js';
import { getCustomerLoyaltyBreakdown } from '../services/loyaltyEngine.js';

const router = Router();

// GET /api/customers - List all customers
router.get('/', (req, res) => {
  const db = getDb();
  const { tier, search, sort = 'loyalty_score', order = 'desc' } = req.query;

  let query = 'SELECT * FROM customers WHERE 1=1';
  const params = [];

  if (tier) {
    query += ' AND loyalty_tier = ?';
    params.push(tier);
  }

  if (search) {
    query += ' AND (name LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const allowedSorts = ['loyalty_score', 'total_spent', 'total_orders', 'name', 'last_order_date'];
  const sortCol = allowedSorts.includes(sort) ? sort : 'loyalty_score';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
  query += ` ORDER BY ${sortCol} ${sortOrder}`;

  const customers = db.prepare(query).all(...params);
  res.json(customers);
});

// GET /api/stats - Dashboard aggregate stats
router.get('/stats', (req, res) => {
  const db = getDb();

  const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
  const totalRevenue = db.prepare('SELECT COALESCE(SUM(total_spent), 0) as sum FROM customers').get().sum;
  const avgScore = db.prepare('SELECT COALESCE(AVG(loyalty_score), 0) as avg FROM customers').get().avg;
  const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;

  const tierDistribution = db.prepare(`
    SELECT loyalty_tier as tier, COUNT(*) as count
    FROM customers GROUP BY loyalty_tier
  `).all();

  const topCustomers = db.prepare(`
    SELECT id, name, loyalty_tier, total_spent, loyalty_score
    FROM customers ORDER BY total_spent DESC LIMIT 5
  `).all();

  const recentOrders = db.prepare(`
    SELECT o.*, c.name as customer_name, c.loyalty_tier
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    ORDER BY o.date DESC LIMIT 10
  `).all();

  res.json({
    totalCustomers,
    totalRevenue,
    avgScore: Math.round(avgScore),
    totalOrders,
    tierDistribution,
    topCustomers,
    recentOrders
  });
});

// GET /api/customers/:id - Single customer detail
router.get('/:id', (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const loyaltyBreakdown = getCustomerLoyaltyBreakdown(customer.id);
  res.json({ ...customer, loyaltyBreakdown });
});

// GET /api/customers/:id/orders
router.get('/:id/orders', (req, res) => {
  const db = getDb();
  const orders = db.prepare(
    'SELECT * FROM orders WHERE customer_id = ? ORDER BY date DESC'
  ).all(req.params.id);
  res.json(orders);
});

// GET /api/customers/:id/events
router.get('/:id/events', (req, res) => {
  const db = getDb();
  const events = db.prepare(
    'SELECT * FROM events WHERE customer_id = ? ORDER BY timestamp DESC LIMIT 50'
  ).all(req.params.id);
  res.json(events);
});

export default router;

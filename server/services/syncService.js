import { getDb } from '../db/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runSync() {
  const db = getDb();

  const customersPath = path.join(__dirname, '..', 'data', 'mock-customers.json');
  const ordersPath = path.join(__dirname, '..', 'data', 'mock-orders.json');

  const customers = JSON.parse(fs.readFileSync(customersPath, 'utf-8'));
  const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf-8'));

  console.log(`📦 Syncing ${customers.length} customers and ${orders.length} orders...`);

  // Upsert customers
  const upsertCustomer = db.prepare(`
    INSERT INTO customers (woo_id, email, name, created_at)
    VALUES (@id, @email, @name, @registered)
    ON CONFLICT(woo_id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name
  `);

  const insertOrder = db.prepare(`
    INSERT OR IGNORE INTO orders (woo_order_id, customer_id, date, total, items_json)
    VALUES (@woo_order_id, @customer_id, @date, @total, @items_json)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO events (customer_id, type, timestamp, metadata_json)
    VALUES (@customer_id, @type, @timestamp, @metadata_json)
  `);

  // Transaction for performance
  const syncAll = db.transaction(() => {
    // Insert customers
    for (const c of customers) {
      upsertCustomer.run(c);
    }

    // Build woo_id to internal id map
    const customerMap = {};
    const allCustomers = db.prepare('SELECT id, woo_id FROM customers').all();
    for (const c of allCustomers) {
      customerMap[c.woo_id] = c.id;
    }

    // Insert orders
    for (const order of orders) {
      const internalId = customerMap[order.customer_id];
      if (!internalId) continue;

      insertOrder.run({
        woo_order_id: order.id,
        customer_id: internalId,
        date: order.date,
        total: order.total,
        items_json: JSON.stringify(order.items)
      });

      // Log event
      insertEvent.run({
        customer_id: internalId,
        type: 'order_placed',
        timestamp: order.date,
        metadata_json: JSON.stringify({ order_id: order.id, total: order.total })
      });
    }

    // Aggregate per customer
    const aggregateQuery = db.prepare(`
      UPDATE customers SET
        total_orders = (SELECT COUNT(*) FROM orders WHERE customer_id = customers.id),
        total_spent = (SELECT COALESCE(SUM(total), 0) FROM orders WHERE customer_id = customers.id),
        first_order_date = (SELECT MIN(date) FROM orders WHERE customer_id = customers.id),
        last_order_date = (SELECT MAX(date) FROM orders WHERE customer_id = customers.id)
    `);
    aggregateQuery.run();

    // Extract preferred categories per customer
    const allCustIds = db.prepare('SELECT DISTINCT id FROM customers').all();
    const updateCategories = db.prepare(
      'UPDATE customers SET preferred_categories = ? WHERE id = ?'
    );
    const getOrders = db.prepare('SELECT items_json FROM orders WHERE customer_id = ?');

    for (const { id } of allCustIds) {
      const categoryCounts = {};
      const orderRows = getOrders.all(id);
      for (const row of orderRows) {
        try {
          const items = JSON.parse(row.items_json || '[]');
          for (const item of items) {
            const cat = item.category || 'Other';
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
          }
        } catch { /* skip bad JSON */ }
      }

      const topCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(e => e[0]);

      if (topCategories.length > 0) {
        updateCategories.run(JSON.stringify(topCategories), id);
      }
    }
  });

  syncAll();

  const count = db.prepare('SELECT COUNT(*) as c FROM customers').get();
  const orderCount = db.prepare('SELECT COUNT(*) as c FROM orders').get();
  console.log(`✅ Synced ${count.c} customers, ${orderCount.c} orders`);

  return { customers: count.c, orders: orderCount.c };
}

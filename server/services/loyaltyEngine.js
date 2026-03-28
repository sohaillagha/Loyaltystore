import { getDb } from '../db/database.js';

// Hardcoded thresholds for the hackathon
const THRESHOLDS = {
  recency: {
    maxDays: 365,   // 365 days = score 0
  },
  frequency: {
    maxOrders: 10,  // 10+ orders = score 100
  },
  monetary: {
    maxSpend: 50000 // 50k+ = score 100
  },
  weights: {
    recency: 0.35,
    frequency: 0.30,
    monetary: 0.35
  },
  tiers: {
    gold: 60,
    silver: 30,
    churnDays: 90,
    churnMinScore: 30
  },
  points: {
    perOrderDivisor: 10,  // 1 point per ₹10 spent
    silverBonus: 50,
    goldBonus: 200
  }
};

function calculateRecencyScore(lastOrderDate) {
  if (!lastOrderDate) return 0;
  const now = new Date();
  const last = new Date(lastOrderDate);
  const daysDiff = Math.floor((now - last) / (1000 * 60 * 60 * 24));
  // More recent = higher score
  const score = Math.max(0, 100 - (daysDiff / THRESHOLDS.recency.maxDays) * 100);
  return Math.min(100, Math.round(score));
}

function calculateFrequencyScore(totalOrders) {
  const score = Math.min(100, (totalOrders / THRESHOLDS.frequency.maxOrders) * 100);
  return Math.round(score);
}

function calculateMonetaryScore(totalSpent) {
  const score = Math.min(100, (totalSpent / THRESHOLDS.monetary.maxSpend) * 100);
  return Math.round(score);
}

function determineTier(loyaltyScore, lastOrderDate) {
  // Check churn risk first
  if (lastOrderDate) {
    const now = new Date();
    const last = new Date(lastOrderDate);
    const daysDiff = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (daysDiff >= THRESHOLDS.tiers.churnDays && loyaltyScore >= THRESHOLDS.tiers.churnMinScore) {
      return 'Churn Risk';
    }
  }

  if (loyaltyScore > THRESHOLDS.tiers.gold) return 'Gold';
  if (loyaltyScore >= THRESHOLDS.tiers.silver) return 'Silver';
  return 'Bronze';
}

function calculatePoints(totalSpent) {
  return Math.floor(totalSpent / THRESHOLDS.points.perOrderDivisor);
}

function generateCoupon(customerId, tier) {
  if (tier === 'Gold') return `GOLD-10-OFF-${customerId}`;
  if (tier === 'Silver') return `SILVER-5-OFF-${customerId}`;
  return null;
}

export function recalculateAllLoyalty() {
  const db = getDb();

  const customers = db.prepare(`
    SELECT id, total_orders, total_spent, last_order_date, loyalty_tier as old_tier
    FROM customers
  `).all();

  const updateCustomer = db.prepare(`
    UPDATE customers SET
      loyalty_score = @loyalty_score,
      loyalty_tier = @loyalty_tier,
      loyalty_points = @loyalty_points,
      coupon_code = @coupon_code
    WHERE id = @id
  `);

  const insertEvent = db.prepare(`
    INSERT INTO events (customer_id, type, timestamp, metadata_json)
    VALUES (@customer_id, @type, datetime('now'), @metadata_json)
  `);

  const recalcAll = db.transaction(() => {
    for (const c of customers) {
      const recency = calculateRecencyScore(c.last_order_date);
      const frequency = calculateFrequencyScore(c.total_orders);
      const monetary = calculateMonetaryScore(c.total_spent);

      const loyaltyScore = Math.round(
        recency * THRESHOLDS.weights.recency +
        frequency * THRESHOLDS.weights.frequency +
        monetary * THRESHOLDS.weights.monetary
      );

      const tier = determineTier(loyaltyScore, c.last_order_date);
      let points = calculatePoints(c.total_spent);

      // Tier bonus
      if (tier === 'Silver' && c.old_tier !== 'Silver' && c.old_tier !== 'Gold') {
        points += THRESHOLDS.points.silverBonus;
      }
      if (tier === 'Gold' && c.old_tier !== 'Gold') {
        points += THRESHOLDS.points.goldBonus;
      }

      const coupon = generateCoupon(c.id, tier);

      updateCustomer.run({
        id: c.id,
        loyalty_score: loyaltyScore,
        loyalty_tier: tier,
        loyalty_points: points,
        coupon_code: coupon
      });

      // Log tier change
      if (c.old_tier && c.old_tier !== tier) {
        insertEvent.run({
          customer_id: c.id,
          type: 'tier_changed',
          metadata_json: JSON.stringify({ from: c.old_tier, to: tier })
        });
      }
    }
  });

  recalcAll();

  // Get tier distribution
  const tiers = db.prepare(`
    SELECT loyalty_tier, COUNT(*) as count
    FROM customers
    GROUP BY loyalty_tier
  `).all();

  console.log('✅ Loyalty recalculated:', tiers);
  return tiers;
}

export function getCustomerLoyaltyBreakdown(customerId) {
  const db = getDb();
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!c) return null;

  return {
    recency_score: calculateRecencyScore(c.last_order_date),
    frequency_score: calculateFrequencyScore(c.total_orders),
    monetary_score: calculateMonetaryScore(c.total_spent),
    loyalty_score: c.loyalty_score,
    loyalty_tier: c.loyalty_tier,
    loyalty_points: c.loyalty_points,
    coupon_code: c.coupon_code
  };
}

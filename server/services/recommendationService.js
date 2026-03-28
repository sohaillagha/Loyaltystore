import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(__dirname, '../data/product-catalog.json'), 'utf-8'));

// Map broad categories from orders → catalog categories
const CATEGORY_MAP = {
  'Electronics': ['Electronics'],
  'Fashion': ['Fashion'],
  'Gaming': ['Gaming'],
  'Home': ['Home'],
  'Beauty': ['Beauty'],
  'Sports': ['Sports'],
  'Other': ['Other', 'Electronics', 'Home'],
  // Product context keywords → catalog categories
  'gaming peripherals': ['Gaming'],
  'luxury skincare': ['Beauty'],
  'running shoes': ['Sports', 'Fashion'],
  'electronics': ['Electronics'],
  'home and kitchen': ['Home'],
  'fashion': ['Fashion'],
  'enterprise': ['Electronics', 'Other'],
};

function mapToCategories(preferredCats, productContext) {
  const cats = new Set();

  // From customer's preferred categories
  if (preferredCats) {
    try {
      const parsed = typeof preferredCats === 'string' ? JSON.parse(preferredCats) : preferredCats;
      parsed.forEach(c => {
        const mapped = CATEGORY_MAP[c] || [c];
        mapped.forEach(m => cats.add(m));
      });
    } catch (e) { /* ignore parse errors */ }
  }

  // From product context (what they're browsing)
  if (productContext) {
    const ctx = productContext.toLowerCase();
    Object.entries(CATEGORY_MAP).forEach(([key, values]) => {
      if (ctx.includes(key.toLowerCase())) {
        values.forEach(v => cats.add(v));
      }
    });
  }

  return cats.size > 0 ? [...cats] : ['Electronics', 'Fashion', 'Other'];
}

function getAvgPriceRange(customerId) {
  const db = getDb();
  const orders = db.prepare('SELECT total FROM orders WHERE customer_id = ?').all(customerId);

  if (orders.length === 0) return { min: 0, max: 50000 };

  const prices = orders.map(o => o.total);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Create a range: 50% below avg to 200% above avg
  return {
    min: Math.max(0, Math.floor(avg * 0.3)),
    max: Math.ceil(avg * 2.5),
  };
}

function getPurchasedProductNames(customerId) {
  const db = getDb();
  const orders = db.prepare('SELECT items_json FROM orders WHERE customer_id = ?').all(customerId);
  const names = new Set();
  orders.forEach(o => {
    try {
      const items = JSON.parse(o.items_json || '[]');
      items.forEach(i => names.add(i.name?.toLowerCase()));
    } catch (e) { /* ignore */ }
  });
  return names;
}

/**
 * Get personalized product recommendations for a customer
 * @param {number} customerId
 * @param {string|null} productContext - what page they're browsing
 * @param {number} count - how many recommendations
 * @returns {Array} recommended products
 */
export function getRecommendations(customerId, productContext = null, count = 4) {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) return [];

  // 1. Determine target categories
  const targetCategories = mapToCategories(customer.preferred_categories, productContext);

  // 2. Get price range from purchase history
  const priceRange = getAvgPriceRange(customerId);

  // 3. Get already-purchased products to avoid repeats
  const purchased = getPurchasedProductNames(customerId);

  // 4. Score & rank products
  const scored = catalog.map(product => {
    let score = 0;

    // Category match (highest weight)
    if (targetCategories.includes(product.category)) {
      score += 50;
    }

    // Price range match
    if (product.price >= priceRange.min && product.price <= priceRange.max) {
      score += 30;
    } else if (product.price < priceRange.min) {
      score += 10; // affordable option
    }

    // Rating bonus
    score += product.rating * 5;

    // Tag bonus
    if (product.tag === 'Bestseller') score += 15;
    if (product.tag === 'Trending') score += 10;
    if (product.tag === 'New') score += 8;
    if (product.tag === 'Top Rated') score += 12;

    // Gold tier? Suggest premium products
    if (customer.loyalty_tier === 'Gold' && product.tag === 'Premium') {
      score += 20;
    }

    // Churn risk? Suggest bestsellers (safe picks)
    if (customer.loyalty_tier === 'Churn Risk' && product.tag === 'Bestseller') {
      score += 15;
    }

    // Penalize already-purchased
    if (purchased.has(product.name.toLowerCase())) {
      score -= 100;
    }

    // Small random factor so recs don't feel static
    score += Math.random() * 5;

    return { ...product, score };
  });

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, count).map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    rating: p.rating,
    image: p.image,
    tag: p.tag,
  }));
}

/**
 * Check if a user message is asking for recommendations
 */
export function isRecommendationQuery(message) {
  const triggers = [
    'recommend', 'suggestion', 'suggest', 'what should i buy',
    'what\'s new', 'whats new', 'new arrivals', 'show me',
    'any deals', 'best products', 'top products', 'popular',
    'what do you have', 'anything new', 'favorite category',
    'help me choose', 'what to buy', 'gift ideas', 'trending',
  ];
  const lower = message.toLowerCase();
  return triggers.some(t => lower.includes(t));
}

/**
 * Format recommendations for the AI prompt context
 */
export function formatRecsForPrompt(recs) {
  return recs.map(r =>
    `${r.image} ${r.name} — ₹${r.price.toLocaleString()} (${r.rating}★${r.tag ? ', ' + r.tag : ''})`
  ).join('\n');
}

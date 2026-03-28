import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
let genAI = null;
let model = null;

function getModel() {
  if (!model) {
    if (!API_KEY) {
      console.warn('⚠️  GEMINI_API_KEY not set — using mock AI mode');
      return null;
    }
    genAI = new GoogleGenerativeAI(API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return model;
}

// Mock responses for demo without API key
function getMockSummary(customer) {
  const tier = customer.loyalty_tier;
  const cats = customer.preferred_categories ? JSON.parse(customer.preferred_categories).join(', ') : 'various categories';
  return `${customer.name} is a ${tier} tier customer who has placed ${customer.total_orders} orders totaling ₹${customer.total_spent.toLocaleString()}. They primarily shop in ${cats} and their last purchase was on ${customer.last_order_date}. ${tier === 'Gold' ? 'This is a highly valuable customer who should receive VIP treatment.' : tier === 'Churn Risk' ? 'This customer is at risk of churning and needs a re-engagement campaign.' : 'There is potential to grow this customer to a higher tier with targeted offers.'}`;
}

function getMockEmail(customer) {
  const tier = customer.loyalty_tier;
  if (tier === 'Gold') {
    return {
      subject: `You're a VIP, ${customer.name}! 🌟 Exclusive Gold Rewards Inside`,
      body: `Dear ${customer.name},\n\nAs one of our most valued Gold members, we want to express our heartfelt gratitude for your continued loyalty.\n\nYou've accumulated ${customer.loyalty_points} loyalty points, and we have some exclusive offers just for you:\n\n• 15% off on your next purchase\n• Early access to new arrivals\n• Free express shipping on all orders\n\nUse your exclusive code: ${customer.coupon_code}\n\nThank you for being part of our family.\n\nWarm regards,\nShopCRM Team`
    };
  } else if (tier === 'Churn Risk') {
    return {
      subject: `We miss you, ${customer.name}! Come back for a special surprise 💝`,
      body: `Dear ${customer.name},\n\nWe've noticed it's been a while since your last visit, and we genuinely miss you!\n\nTo welcome you back, we'd like to offer:\n\n• 20% off on your next order\n• Double loyalty points on your next purchase\n• Free shipping with no minimum\n\nWe value your past patronage and would love to have you back.\n\nHoping to see you soon,\nShopCRM Team`
    };
  }
  return {
    subject: `Great news, ${customer.name}! You're close to the next tier! 🚀`,
    body: `Hi ${customer.name},\n\nThanks for shopping with us! With ${customer.loyalty_points} points, you're making great progress.\n\nHere's what's waiting for you:\n\n• Keep shopping to unlock Silver/Gold benefits\n• Earn points on every purchase\n• Exclusive deals for loyal customers\n\nKeep going — amazing rewards are just around the corner!\n\nCheers,\nShopCRM Team`
  };
}

function getMockAction(customer) {
  const tier = customer.loyalty_tier;
  const cats = customer.preferred_categories ? JSON.parse(customer.preferred_categories) : [];
  if (tier === 'Gold') {
    return `Recommend exclusive early access to new arrivals in ${cats[0] || 'their preferred category'}. Send a personalized thank-you note with VIP perks. Avoid generic discounts — this customer values exclusivity over price cuts.`;
  } else if (tier === 'Churn Risk') {
    return `Urgent: Send a win-back campaign with a 20% discount and free shipping. Highlight what's new in ${cats[0] || 'their favorite category'} since their last visit. Consider a personal outreach call for high-value churning customers.`;
  } else if (tier === 'Silver') {
    return `Push toward Gold tier with a "You're almost there!" campaign. Offer bonus double-points weekend on ${cats[0] || 'popular'} items. Cross-sell complementary products from ${cats[1] || 'related categories'}.`;
  }
  return `Welcome campaign: Send curated product recommendations in ${cats[0] || 'trending categories'}. Offer a first-timer discount of 10% to encourage second purchase. Enroll in loyalty points awareness email series.`;
}

export async function generateCustomerSummary(customer, orders) {
  const m = getModel();
  if (!m) return getMockSummary(customer);

  const prompt = `You are a CRM analyst. Generate a concise 2-3 sentence customer profile summary.

Customer Data:
- Name: ${customer.name}
- Tier: ${customer.loyalty_tier}
- Total Orders: ${customer.total_orders}
- Total Spent: ₹${customer.total_spent}
- First Order: ${customer.first_order_date}
- Last Order: ${customer.last_order_date}
- Loyalty Score: ${customer.loyalty_score}/100
- Loyalty Points: ${customer.loyalty_points}
- Preferred Categories: ${customer.preferred_categories}

Recent Orders: ${JSON.stringify(orders.slice(0, 5))}

Write a brief, insightful summary about this customer's shopping behavior, preferences, and value. Include actionable insights.`;

  try {
    const result = await m.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('AI Summary error:', err.message);
    return getMockSummary(customer);
  }
}

export async function generateEmailDraft(customer) {
  const m = getModel();
  if (!m) return getMockEmail(customer);

  const emailType = customer.loyalty_tier === 'Gold' ? 'VIP appreciation and exclusive rewards' :
    customer.loyalty_tier === 'Churn Risk' ? 'win-back re-engagement' :
    customer.loyalty_tier === 'Silver' ? 'tier upgrade encouragement' : 'welcome and loyalty introduction';

  const prompt = `You are an email marketing expert. Generate a ${emailType} email for this customer.

Customer: ${customer.name}
Tier: ${customer.loyalty_tier}
Total Spent: ₹${customer.total_spent}
Loyalty Points: ${customer.loyalty_points}
Preferred Categories: ${customer.preferred_categories}
Coupon Code: ${customer.coupon_code || 'WELCOME10'}

Generate a JSON response with "subject" and "body" fields. The email should be warm, on-brand, and include relevant offers/CTAs. Return ONLY valid JSON.`;

  try {
    const result = await m.generateContent(prompt);
    const text = result.response.text();
    // Try to parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return getMockEmail(customer);
  } catch (err) {
    console.error('AI Email error:', err.message);
    return getMockEmail(customer);
  }
}

export async function generateNextBestAction(customer) {
  const m = getModel();
  if (!m) return getMockAction(customer);

  const prompt = `You are a marketing strategist for an e-commerce CRM. Based on this customer's RFM profile, suggest the single best next marketing action.

Customer: ${customer.name}
Tier: ${customer.loyalty_tier}
Loyalty Score: ${customer.loyalty_score}/100
Total Orders: ${customer.total_orders}
Total Spent: ₹${customer.total_spent}
Last Order: ${customer.last_order_date}
Preferred Categories: ${customer.preferred_categories}
Current Points: ${customer.loyalty_points}

Be specific: mention the exact discount %, product category, channel, and timing. Also say what NOT to do. Keep it to 2-3 sentences.`;

  try {
    const result = await m.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('AI Action error:', err.message);
    return getMockAction(customer);
  }
}

export async function explainScore(customer, breakdown) {
  const m = getModel();

  const daysSinceLastOrder = customer.last_order_date
    ? Math.floor((Date.now() - new Date(customer.last_order_date)) / (1000 * 60 * 60 * 24))
    : null;

  if (!m) {
    // High-quality mock explanation
    const parts = [];
    if (breakdown.recency_score >= 70) {
      parts.push(`you ordered recently (${daysSinceLastOrder} days ago), which keeps your recency score high at ${breakdown.recency_score}/100`);
    } else if (breakdown.recency_score >= 40) {
      parts.push(`your last order was ${daysSinceLastOrder} days ago — your recency score of ${breakdown.recency_score}/100 is moderate`);
    } else {
      parts.push(`it's been ${daysSinceLastOrder} days since your last order, pulling your recency score down to ${breakdown.recency_score}/100`);
    }

    if (breakdown.frequency_score >= 60) {
      parts.push(`with ${customer.total_orders} orders, your frequency score is strong at ${breakdown.frequency_score}/100`);
    } else {
      parts.push(`you've placed ${customer.total_orders} orders so far, giving a frequency score of ${breakdown.frequency_score}/100 — more purchases would boost this`);
    }

    if (breakdown.monetary_score >= 70) {
      parts.push(`you've spent ₹${customer.total_spent.toLocaleString()} total, earning an excellent monetary score of ${breakdown.monetary_score}/100`);
    } else {
      parts.push(`your total spend of ₹${customer.total_spent.toLocaleString()} gives a monetary score of ${breakdown.monetary_score}/100`);
    }

    return `Your loyalty score is ${customer.loyalty_score}/100 because ${parts.join('. Also, ')}. ${customer.loyalty_tier === 'Gold' ? 'You\'re one of our top customers!' : customer.loyalty_tier === 'Churn Risk' ? 'Come back soon — we miss you!' : 'Keep shopping to unlock the next tier!'}`;
  }

  const prompt = `Explain this customer's loyalty score in 2-3 plain-English sentences. Be specific with numbers. Make it conversational and helpful.

Customer: ${customer.name}
Overall Score: ${customer.loyalty_score}/100
Tier: ${customer.loyalty_tier}

RFM Breakdown (each out of 100):
- Recency Score: ${breakdown.recency_score} (last order ${daysSinceLastOrder} days ago)
- Frequency Score: ${breakdown.frequency_score} (${customer.total_orders} total orders)
- Monetary Score: ${breakdown.monetary_score} (₹${customer.total_spent} total spent)

Weights: Recency 35%, Frequency 30%, Monetary 35%

Explain what's driving the score up and what's pulling it down. Don't use technical terms like "RFM". Speak as if talking to the customer directly.`;

  try {
    const result = await m.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('AI Explain error:', err.message);
    return `Your score is ${customer.loyalty_score}/100, driven by ${customer.total_orders} orders totaling ₹${customer.total_spent.toLocaleString()}. ${breakdown.recency_score < 50 ? 'Ordering more recently would boost your score significantly.' : 'Your recent activity is keeping your score healthy!'}`;
  }
}


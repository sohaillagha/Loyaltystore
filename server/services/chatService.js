import { getDb } from '../db/database.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { selectEmotionProfile, emotionProfiles } from '../config/emotionProfiles.js';
import { getRecommendations, isRecommendationQuery, formatRecsForPrompt } from './recommendationService.js';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
let genAI = null;
let model = null;

function getModel() {
  if (!model && API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return model;
}

// Mock responses based on emotion profile
function getMockResponse(profile, message, customer) {
  const responses = {
    playful_support: [
      `Hey there! 😊 Great question! Let me check that for you real quick... Your order should be on its way! 🚀 Anything else I can help with?`,
      `Oh awesome, thanks for reaching out! 🎉 So here's the deal — ${customer.name}, you've got ${customer.loyalty_points} points saved up! That's pretty cool! Want me to check what you can redeem? ✨`,
      `No worries at all! 😄 I totally get it. Let me sort this out for you ASAP! By the way, have you checked out our new arrivals? They're 🔥`
    ],
    premium_concierge: [
      `Good day, ${customer.name}. Thank you for reaching out to us. As a valued ${customer.loyalty_tier} member, your satisfaction is our highest priority. I'd be delighted to assist you with your inquiry. Let me look into this personally for you.`,
      `${customer.name}, it's a pleasure to hear from you. With your impressive ${customer.loyalty_points} loyalty points, you have access to our exclusive Gold member benefits. I would be happy to walk you through the premium options available to you.`,
      `Thank you for your patience, ${customer.name}. I want to ensure we provide you with the exceptional service you deserve. I've reviewed your account and have a personalized recommendation for you.`
    ],
    efficient_helpdesk: [
      `Here's the status:\n• Order #${customer.total_orders}: Processing\n• Estimated delivery: 3-5 business days\n• Tracking link will be emailed once shipped.\n\nNeed anything else?`,
      `Account summary:\n• Points: ${customer.loyalty_points}\n• Tier: ${customer.loyalty_tier}\n• Active coupon: ${customer.coupon_code || 'None'}\n\nLet me know if you need specific details.`,
      `Issue noted. Steps to resolve:\n1. Clear your browser cache\n2. Re-login to your account\n3. Try the action again\n\nIf the problem persists, I'll escalate it.`
    ],
    empathetic_recovery: [
      `${customer.name}, I want you to know that your experience truly matters to us, and I'm sincerely sorry if we've fallen short of your expectations. We've noticed it's been a while since your last visit, and we genuinely miss having you as part of our community. I'd love to make things right — we have a special offer just for you.`,
      `I completely understand your frustration, ${customer.name}, and please know that your feelings are entirely valid. We take full responsibility and want to make this right for you. As an immediate gesture, I'd like to offer you 20% off your next purchase along with complimentary express shipping.`,
      `${customer.name}, thank you so much for giving us another chance to earn your trust. We've been working hard to improve, and your feedback has been invaluable. Allow me to personally ensure your next experience exceeds every expectation.`
    ]
  };

  const profileResponses = responses[profile.name] || responses.playful_support;
  return profileResponses[Math.floor(Math.random() * profileResponses.length)];
}

export function startChatSession(customerId, productContext) {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);

  if (!customer) throw new Error('Customer not found');

  const profile = selectEmotionProfile(customer, productContext);

  const result = db.prepare(`
    INSERT INTO chat_sessions (customer_id, emotion_profile, product_context, messages_json)
    VALUES (?, ?, ?, '[]')
  `).run(customerId, profile.name, productContext);

  return {
    sessionId: result.lastInsertRowid,
    profile: {
      name: profile.name,
      label: profile.label,
      description: profile.description,
      color: profile.color
    },
    customer: {
      id: customer.id,
      name: customer.name,
      tier: customer.loyalty_tier,
      points: customer.loyalty_points
    }
  };
}

export async function sendMessage(sessionId, userMessage) {
  const db = getDb();
  const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId);
  if (!session) throw new Error('Session not found');

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(session.customer_id);
  const profile = emotionProfiles[session.emotion_profile];

  // Build conversation history
  const messages = JSON.parse(session.messages_json || '[]');
  messages.push({ role: 'user', content: userMessage, timestamp: new Date().toISOString() });

  // Check if user is asking for recommendations
  const wantsRecs = isRecommendationQuery(userMessage);
  let recommendations = [];

  if (wantsRecs) {
    recommendations = getRecommendations(session.customer_id, session.product_context, 4);
  }

  let aiResponse;
  const m = getModel();

  if (m) {
    // Build the prompt with three layers
    const systemPrompt = `You are a customer support chatbot for ShopCRM, an e-commerce store.

TONE INSTRUCTIONS: ${profile.toneInstructions}

RESPONSE LENGTH: Keep responses ${profile.responseLengthHint}. 
EMOJI USAGE: ${profile.emojiUsage}
APOLOGY STYLE (if needed): ${profile.apologyStyle}

Always prioritize solving the customer's problem clearly. Never make up order numbers or tracking IDs. If you don't know something, say so honestly in the appropriate tone.`;

    const crmContext = `CUSTOMER CONTEXT:
- Name: ${customer.name}
- Email: ${customer.email}
- Loyalty Tier: ${customer.loyalty_tier}
- Total Spend: ₹${customer.total_spent}
- Total Orders: ${customer.total_orders}
- Last Order: ${customer.last_order_date}
- Loyalty Points: ${customer.loyalty_points}
- Preferred Categories: ${customer.preferred_categories}
- Coupon Code: ${customer.coupon_code || 'None active'}
${session.product_context ? `- Currently browsing: ${session.product_context}` : ''}`;

    // Add recommendation context if applicable
    let recsContext = '';
    if (wantsRecs && recommendations.length > 0) {
      recsContext = `\n\nPRODUCT RECOMMENDATIONS (curated for this customer — mention these naturally):\n${formatRecsForPrompt(recommendations)}\n\nPresent these recommendations naturally in your response. Don't list all details — just mention names and why they'd like them.`;
    }

    const conversationHistory = messages.slice(-10).map(m =>
      `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.content}`
    ).join('\n');

    const fullPrompt = `${systemPrompt}\n\n${crmContext}${recsContext}\n\nCONVERSATION:\n${conversationHistory}\n\nRespond as the assistant:`;

    try {
      const result = await m.generateContent(fullPrompt);
      aiResponse = result.response.text();
    } catch (err) {
      console.error('Chat AI error:', err.message);
      aiResponse = getMockRecommendationResponse(profile, customer, recommendations) || getMockResponse(profile, userMessage, customer);
    }
  } else {
    if (wantsRecs && recommendations.length > 0) {
      aiResponse = getMockRecommendationResponse(profile, customer, recommendations);
    } else {
      aiResponse = getMockResponse(profile, userMessage, customer);
    }
  }

  // Add AI response to history
  messages.push({ role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() });

  // Save updated messages
  db.prepare('UPDATE chat_sessions SET messages_json = ? WHERE id = ?')
    .run(JSON.stringify(messages), sessionId);

  return {
    response: aiResponse,
    profile: profile.name,
    profileLabel: profile.label,
    profileColor: profile.color,
    recommendations: wantsRecs ? recommendations : undefined
  };
}

function getMockRecommendationResponse(profile, customer, recs) {
  if (!recs || recs.length === 0) return null;
  const recNames = recs.map(r => `${r.image} ${r.name}`).join(', ');
  const responses = {
    playful_support: `Ooh great question! 😍 Based on what you love, I've got some awesome picks for you! Check these out: ${recNames}. They're all super popular right now! 🔥 Want details on any of them?`,
    premium_concierge: `${customer.name}, I've personally curated a selection based on your preferences and purchase history. I'd recommend: ${recNames}. Each has been chosen for its exceptional quality. Shall I provide more details on any of these?`,
    efficient_helpdesk: `Based on your purchase history, here are your top recommendations:\n${recs.map(r => `• ${r.image} ${r.name} — ₹${r.price.toLocaleString()}`).join('\n')}\n\nWant to know more about any item?`,
    empathetic_recovery: `${customer.name}, I'd love to help you find something perfect! Based on what I know you enjoy, I think you'd really love these: ${recNames}. We've also got some special offers that might interest you. Would any of these catch your eye?`
  };
  return responses[profile.name] || responses.playful_support;
}

export function getChatSession(sessionId) {
  const db = getDb();
  const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId);
  if (!session) return null;

  const customer = db.prepare('SELECT id, name, loyalty_tier, loyalty_points FROM customers WHERE id = ?')
    .get(session.customer_id);

  return {
    ...session,
    messages: JSON.parse(session.messages_json || '[]'),
    customer,
    profile: emotionProfiles[session.emotion_profile]
  };
}

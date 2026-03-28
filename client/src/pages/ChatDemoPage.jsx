import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import TierBadge from '../components/TierBadge';
import './ChatDemoPage.css';

const EMOTION_PROFILES = [
  { key: 'playful_support', label: '😄 Playful Support', color: '#10b981', desc: 'Casual, fun, emoji-filled' },
  { key: 'premium_concierge', label: '👔 Premium Concierge', color: '#ca8a04', desc: 'Polite, formal, VIP tone' },
  { key: 'efficient_helpdesk', label: '⚡ Efficient Helpdesk', color: '#3b82f6', desc: 'Short, to-the-point, technical' },
  { key: 'empathetic_recovery', label: '💜 Empathetic Recovery', color: '#dc2626', desc: 'Warm, caring, apologetic' },
];

const PRODUCT_CONTEXTS = [
  { value: 'auto', label: '🤖 Auto-detect from purchase history' },
  { value: '', label: 'No specific context' },
  { value: 'Gaming peripherals and accessories', label: '🎮 Gaming' },
  { value: 'Luxury skincare and beauty', label: '💎 Luxury Beauty' },
  { value: 'Running shoes and sports gear', label: '🏃 Sports & Running' },
  { value: 'Electronics and technical products', label: '💻 Electronics' },
  { value: 'Home and kitchen appliances', label: '🏠 Home & Kitchen' },
  { value: 'Fashion and streetwear', label: '👗 Fashion' },
  { value: 'Enterprise software solutions', label: '🏢 Enterprise Tech' },
];

// Map preferred_categories → product context for auto-detect
const CATEGORY_TO_CONTEXT = {
  'Electronics': 'Electronics and technical products',
  'Fashion': 'Fashion and streetwear',
  'Gaming': 'Gaming peripherals and accessories',
  'Home': 'Home and kitchen appliances',
  'Beauty': 'Luxury skincare and beauty',
  'Sports': 'Running shoes and sports gear',
  'Other': '',
};

function autoDetectContext(customer) {
  if (!customer?.preferred_categories) return { context: '', detected: null };
  try {
    const cats = JSON.parse(customer.preferred_categories);
    if (cats.length === 0) return { context: '', detected: null };
    const topCat = cats[0];
    const mapped = CATEGORY_TO_CONTEXT[topCat] || '';
    const label = PRODUCT_CONTEXTS.find(p => p.value === mapped)?.label || topCat;
    return { context: mapped, detected: `${label} (from "${topCat}")` };
  } catch {
    return { context: '', detected: null };
  }
}

export default function ChatDemoPage() {
  const api = useApi();
  const messagesEndRef = useRef(null);

  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [productContext, setProductContext] = useState('auto');
  const [detectedContext, setDetectedContext] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  // Advanced customization
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [overrideProfile, setOverrideProfile] = useState('auto');
  const [toneIntensity, setToneIntensity] = useState('normal');
  const [responseLength, setResponseLength] = useState('medium');
  const [enableEmoji, setEnableEmoji] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [brandVoice, setBrandVoice] = useState('');

  useEffect(() => {
    api.getCustomers({ sort: 'loyalty_score', order: 'desc' }).then(setCustomers).catch(console.error);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startChat = async () => {
    if (!selectedCustomer) return;
    setStarting(true);
    setMessages([]);
    try {
      // Resolve auto-detect
      let resolvedContext = productContext;
      let contextLabel = '';
      if (productContext === 'auto') {
        const detected = autoDetectContext(selectedCustomer);
        resolvedContext = detected.context;
        contextLabel = detected.detected ? ` Product context auto-detected: ${detected.detected}.` : '';
        setDetectedContext(detected.detected);
      } else {
        setDetectedContext(null);
      }

      const result = await api.startChat(selectedCustomer.id, resolvedContext || null);
      setSessionId(result.sessionId);
      setProfile(result.profile);

      const overrideInfo = overrideProfile !== 'auto'
        ? ` (Manual override: ${EMOTION_PROFILES.find(p => p.key === overrideProfile)?.label})`
        : '';

      setMessages([{
        role: 'system',
        content: `Chat started with ${result.customer.name} (${result.customer.tier}). Emotion profile: ${result.profile.label}.${overrideInfo}${contextLabel}`,
      }]);
    } catch (err) {
      console.error(err);
    } finally {
      setStarting(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const result = await api.sendChatMessage(sessionId, userMsg);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.response,
        profile: result.profileLabel,
        profileColor: result.profileColor,
        recommendations: result.recommendations || null,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetChat = () => {
    setSessionId(null);
    setProfile(null);
    setMessages([]);
    setInput('');
  };

  return (
    <div className="chat-demo">
      <div className="page-header">
        <h1>💬 AI Chat Demo</h1>
        <p>See how the chatbot adapts its tone based on customer profile and product context</p>
      </div>

      <div className="chat-demo__layout">
        {/* Config Panel */}
        <div className="chat-demo__config-scroll">
          <div className="glass-card chat-demo__config">
            <h3 className="chat-demo__config-title">🎛️ Chat Configuration</h3>

            {/* Customer Selection */}
            <div className="chat-demo__field">
              <label>Select Customer</label>
              <select
                className="select"
                value={selectedCustomer?.id || ''}
                onChange={(e) => {
                  const c = customers.find(c => c.id === parseInt(e.target.value));
                  setSelectedCustomer(c || null);
                  resetChat();
                }}
              >
                <option value="">Choose a customer...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.loyalty_tier} (Score: {c.loyalty_score})
                  </option>
                ))}
              </select>
            </div>

            {selectedCustomer && (
              <div className="chat-demo__customer-preview animate-fade-in">
                <div className="chat-demo__customer-header">
                  <div className="chat-demo__customer-avatar">
                    {selectedCustomer.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <strong>{selectedCustomer.name}</strong>
                    <TierBadge tier={selectedCustomer.loyalty_tier} />
                  </div>
                </div>
                <div className="chat-demo__customer-stats">
                  <div><span>Score</span><strong>{selectedCustomer.loyalty_score}</strong></div>
                  <div><span>Spent</span><strong>₹{selectedCustomer.total_spent?.toLocaleString()}</strong></div>
                  <div><span>Orders</span><strong>{selectedCustomer.total_orders}</strong></div>
                  <div><span>Points</span><strong>{selectedCustomer.loyalty_points?.toLocaleString()}</strong></div>
                </div>
              </div>
            )}

            {/* Product Context */}
            <div className="chat-demo__field">
              <label>Product Context</label>
              <select
                className="select"
                value={productContext}
                onChange={(e) => { setProductContext(e.target.value); resetChat(); }}
              >
                {PRODUCT_CONTEXTS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {productContext === 'auto' && selectedCustomer && (
                <span className="chat-demo__field-hint">
                  Will use: {autoDetectContext(selectedCustomer).detected || 'General (no category data)'}
                </span>
              )}
            </div>

            {/* Advanced Toggle */}
            <button
              className="chat-demo__advanced-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span>{showAdvanced ? '▼' : '▶'} Advanced Settings</span>
              <span className="chat-demo__advanced-badge">Customise</span>
            </button>

            {showAdvanced && (
              <div className="chat-demo__advanced animate-fade-in">
                {/* Profile Override */}
                <div className="chat-demo__field">
                  <label>Emotion Profile</label>
                  <select
                    className="select"
                    value={overrideProfile}
                    onChange={(e) => { setOverrideProfile(e.target.value); resetChat(); }}
                  >
                    <option value="auto">🤖 Auto-detect (Recommended)</option>
                    {EMOTION_PROFILES.map(p => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                  <span className="chat-demo__field-hint">
                    Override the AI-selected persona manually
                  </span>
                </div>

                {/* Tone Intensity */}
                <div className="chat-demo__field">
                  <label>Tone Intensity</label>
                  <div className="chat-demo__radio-group">
                    {['subtle', 'normal', 'strong'].map(v => (
                      <label key={v} className={`chat-demo__radio-btn ${toneIntensity === v ? 'active' : ''}`}>
                        <input type="radio" name="tone" value={v} checked={toneIntensity === v}
                          onChange={() => setToneIntensity(v)} />
                        {v === 'subtle' ? '🌊 Subtle' : v === 'normal' ? '⚖️ Normal' : '🔥 Strong'}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Response Length */}
                <div className="chat-demo__field">
                  <label>Response Length</label>
                  <div className="chat-demo__radio-group">
                    {['short', 'medium', 'long'].map(v => (
                      <label key={v} className={`chat-demo__radio-btn ${responseLength === v ? 'active' : ''}`}>
                        <input type="radio" name="length" value={v} checked={responseLength === v}
                          onChange={() => setResponseLength(v)} />
                        {v === 'short' ? '📝 Short' : v === 'medium' ? '📄 Medium' : '📜 Long'}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Emoji Toggle */}
                <div className="chat-demo__field">
                  <label>Emoji Usage</label>
                  <div className="chat-demo__toggle-row">
                    <button
                      className={`chat-demo__toggle ${enableEmoji ? 'active' : ''}`}
                      onClick={() => setEnableEmoji(!enableEmoji)}
                    >
                      <span className="chat-demo__toggle-knob"></span>
                    </button>
                    <span>{enableEmoji ? 'Enabled 😊' : 'Disabled'}</span>
                  </div>
                </div>

                {/* Custom Brand Voice */}
                <div className="chat-demo__field">
                  <label>Brand Voice Override</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. 'Talk like a friendly barista'"
                    value={brandVoice}
                    onChange={(e) => setBrandVoice(e.target.value)}
                  />
                  <span className="chat-demo__field-hint">
                    Custom instruction appended to the AI prompt
                  </span>
                </div>

                {/* Custom Customer Name */}
                <div className="chat-demo__field">
                  <label>Override Customer Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. 'Sir', 'Dear valued customer'"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <button
              className="btn btn-primary chat-demo__start-btn"
              onClick={startChat}
              disabled={!selectedCustomer || starting}
            >
              {starting ? (
                <><span className="loading-spinner"></span> Starting...</>
              ) : sessionId ? '🔄 Restart Chat' : '🚀 Start Chat Session'}
            </button>

            {profile && (
              <div className="chat-demo__profile-badge animate-fade-in" style={{ borderColor: profile.color + '40' }}>
                <div className="chat-demo__profile-dot" style={{ background: profile.color }}></div>
                <div>
                  <strong style={{ color: profile.color }}>{profile.label}</strong>
                  <p>{profile.description}</p>
                </div>
              </div>
            )}

            {/* Quick Config Summary */}
            {showAdvanced && sessionId && (
              <div className="chat-demo__config-summary animate-fade-in">
                <h4>Active Config</h4>
                <div className="chat-demo__config-pills">
                  <span className="chat-demo__pill">
                    Profile: {overrideProfile === 'auto' ? 'Auto' : overrideProfile.replace('_', ' ')}
                  </span>
                  <span className="chat-demo__pill">Tone: {toneIntensity}</span>
                  <span className="chat-demo__pill">Length: {responseLength}</span>
                  <span className="chat-demo__pill">Emoji: {enableEmoji ? 'On' : 'Off'}</span>
                  {brandVoice && <span className="chat-demo__pill">Voice: Custom</span>}
                </div>
              </div>
            )}

            {/* Suggested Messages */}
            {sessionId && (
              <div className="chat-demo__suggestions">
                <p className="chat-demo__suggestions-label">Try asking:</p>
                {[
                  "Suggest products for me! 🛍️",
                  "What's new in my favorite category?",
                  "Where is my order?",
                  "What rewards do I have?",
                  "I want to return an item",
                  "I'm not happy with my purchase"
                ].map(q => (
                  <button
                    key={q}
                    className="chat-demo__suggestion-btn"
                    onClick={() => { setInput(q); }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat Window */}
        <div className="glass-card chat-demo__window">
          {!sessionId ? (
            <div className="chat-demo__placeholder">
              <div className="chat-demo__placeholder-icon">💬</div>
              <h3>Select a customer and start a chat</h3>
              <p>The AI will automatically adapt its tone based on the customer's loyalty profile and product context</p>

              {/* Profile Preview Grid */}
              <div className="chat-demo__profile-grid">
                {EMOTION_PROFILES.map(p => (
                  <div key={p.key} className="chat-demo__profile-preview" style={{ borderColor: p.color + '30' }}>
                    <strong style={{ color: p.color }}>{p.label}</strong>
                    <span>{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="chat-demo__chat-header">
                <div className="chat-demo__chat-header-left">
                  <span className="chat-demo__bot-avatar">🤖</span>
                  <div>
                    <strong>ShopCRM Assistant</strong>
                    {profile && (
                      <span className="chat-demo__profile-indicator" style={{ color: profile.color }}>
                        {profile.label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="chat-demo__profile-chip" style={{
                  background: profile?.color + '15',
                  borderColor: profile?.color + '30',
                  color: profile?.color
                }}>
                  {profile?.label}
                </div>
              </div>

              {/* Messages */}
              <div className="chat-demo__messages">
                {messages.map((msg, i) => (
                  <div key={i} className={`chat-bubble chat-bubble--${msg.role}`}>
                    {msg.role === 'assistant' && (
                      <div className="chat-bubble__avatar">🤖</div>
                    )}
                    <div className="chat-bubble__content">
                      {msg.role === 'system' ? (
                        <div className="chat-bubble__system">{msg.content}</div>
                      ) : (
                        <div className="chat-bubble__text">{msg.content}</div>
                      )}
                      {msg.recommendations && msg.recommendations.length > 0 && (
                        <div className="rec-chips">
                          <span className="rec-chips__label">🛍️ Recommended for you</span>
                          <div className="rec-chips__grid">
                            {msg.recommendations.map(r => (
                              <div key={r.id} className="rec-chip">
                                <span className="rec-chip__image">{r.image}</span>
                                <div className="rec-chip__info">
                                  <span className="rec-chip__name">{r.name}</span>
                                  <span className="rec-chip__price">₹{r.price.toLocaleString()}</span>
                                </div>
                                {r.tag && <span className="rec-chip__tag">{r.tag}</span>}
                                <span className="rec-chip__rating">{'⭐'.repeat(Math.round(r.rating))} {r.rating}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {msg.profileColor && (
                        <span className="chat-bubble__profile-tag" style={{ color: msg.profileColor }}>
                          {msg.profile}
                        </span>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="chat-bubble__avatar chat-bubble__avatar--user">
                        {selectedCustomer?.name.split(' ').map(n => n[0]).join('')}
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="chat-bubble chat-bubble--assistant">
                    <div className="chat-bubble__avatar">🤖</div>
                    <div className="chat-bubble__content">
                      <div className="chat-bubble__typing">
                        <span></span><span></span><span></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="chat-demo__input-area">
                <input
                  type="text"
                  className="input chat-demo__input"
                  placeholder="Type your message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                />
                <button
                  className="btn btn-primary"
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

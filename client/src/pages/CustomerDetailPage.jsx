import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { formatCurrency, formatDate, formatRelativeDate } from '../utils/formatters';
import TierBadge from '../components/TierBadge';
import './CustomerDetailPage.css';

const EVENT_ICONS = {
  order_placed: '🛒',
  tier_changed: '⭐',
  email_sent: '✉️',
  coupon_used: '🎟',
  chat_started: '💬',
  points_redeemed: '🎁',
};

const TIER_RANK = { 'Bronze': 1, 'Silver': 2, 'Gold': 3, 'Churn Risk': 0 };

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();

  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // AI states
  const [summary, setSummary] = useState(null);
  const [email, setEmail] = useState(null);
  const [action, setAction] = useState(null);
  const [scoreExplanation, setScoreExplanation] = useState(null);
  const [aiLoading, setAiLoading] = useState({
    summary: false, email: false, action: false, explain: false
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [c, o, e] = await Promise.all([
          api.getCustomer(id),
          api.getCustomerOrders(id),
          api.getCustomerEvents(id),
        ]);
        setCustomer(c);
        setOrders(o);
        setEvents(e);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const generateSummary = async () => {
    setAiLoading(p => ({ ...p, summary: true }));
    try {
      const data = await api.getSummary(id);
      setSummary(data.summary);
    } catch (err) { console.error(err); }
    finally { setAiLoading(p => ({ ...p, summary: false })); }
  };

  const generateEmail = async () => {
    setAiLoading(p => ({ ...p, email: true }));
    try {
      const data = await api.getEmail(id);
      setEmail(data);
    } catch (err) { console.error(err); }
    finally { setAiLoading(p => ({ ...p, email: false })); }
  };

  const generateAction = async () => {
    setAiLoading(p => ({ ...p, action: true }));
    try {
      const data = await api.getAction(id);
      setAction(data.action);
    } catch (err) { console.error(err); }
    finally { setAiLoading(p => ({ ...p, action: false })); }
  };

  const handleExplainScore = async () => {
    if (scoreExplanation) { setScoreExplanation(null); return; }
    setAiLoading(p => ({ ...p, explain: true }));
    try {
      const data = await api.explainScore(id);
      setScoreExplanation(data.explanation);
    } catch (err) { console.error(err); }
    finally { setAiLoading(p => ({ ...p, explain: false })); }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading customer profile...</p>
      </div>
    );
  }

  if (!customer) {
    return <div className="loading-container"><p>Customer not found</p></div>;
  }

  const categories = customer.preferred_categories ? JSON.parse(customer.preferred_categories) : [];
  const lb = customer.loyaltyBreakdown || {};

  // Check for recent tier upgrade
  const tierChangeEvent = events.find(e => e.type === 'tier_changed');
  let tierUpgrade = null;
  if (tierChangeEvent) {
    try {
      const meta = JSON.parse(tierChangeEvent.metadata_json);
      if (TIER_RANK[meta.to] > TIER_RANK[meta.from]) {
        tierUpgrade = meta;
      }
    } catch {}
  }

  // Build journey milestones from events
  const journeyNodes = buildJourney(customer, events, orders);

  return (
    <div className="customer-detail">
      <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>
        ← Back
      </button>

      {/* Profile Header */}
      <div className="glass-card cd-header">
        <div className="cd-header__main">
          <div className={`cd-header__avatar ${tierUpgrade ? 'cd-header__avatar--upgraded' : ''}`}>
            {customer.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="cd-header__info">
            <h2>{customer.name}</h2>
            <p className="cd-header__email">{customer.email}</p>
            <div className="cd-header__badges">
              <div className={tierUpgrade ? 'tier-badge-glow' : ''}>
                <TierBadge tier={customer.loyalty_tier} />
              </div>
              {tierUpgrade && (
                <span className="cd-level-up animate-fade-in">
                  🎉 Leveled up from {tierUpgrade.from}!
                </span>
              )}
              {customer.coupon_code && (
                <span className="cd-coupon">🎟 {customer.coupon_code}</span>
              )}
            </div>
          </div>
        </div>

        <div className="cd-header__metrics">
          <div className="cd-metric">
            <span className="cd-metric__label">Total Spent</span>
            <span className="cd-metric__value cd-metric__value--teal">
              {formatCurrency(customer.total_spent)}
            </span>
          </div>
          <div className="cd-metric">
            <span className="cd-metric__label">Total Orders</span>
            <span className="cd-metric__value">{customer.total_orders}</span>
          </div>
          <div className="cd-metric">
            <span className="cd-metric__label">Loyalty Score</span>
            <span className="cd-metric__value cd-metric__value--purple">{customer.loyalty_score}/100</span>
            <button
              className="cd-why-btn"
              onClick={handleExplainScore}
              disabled={aiLoading.explain}
            >
              {aiLoading.explain ? '...' : scoreExplanation ? '✕ Close' : '💡 Why?'}
            </button>
          </div>
          <div className="cd-metric">
            <span className="cd-metric__label">Points</span>
            <span className="cd-metric__value cd-metric__value--gold">{customer.loyalty_points?.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Score Explanation */}
      {scoreExplanation && (
        <div className="glass-card cd-explain animate-fade-in-up">
          <div className="cd-explain__icon">💡</div>
          <div className="cd-explain__content">
            <h4>Why is your score {customer.loyalty_score}/100?</h4>
            <p>{scoreExplanation}</p>
          </div>
        </div>
      )}

      {/* Customer Journey Map */}
      {journeyNodes.length > 0 && (
        <div className="glass-card cd-journey">
          <h3 className="cd-section-title">🗺️ Customer Journey</h3>
          <div className="cd-journey__track">
            {journeyNodes.map((node, i) => (
              <div key={i} className={`cd-journey__node ${node.highlight ? 'cd-journey__node--highlight' : ''}`}>
                <div className="cd-journey__icon" style={{ background: node.color }}>
                  {node.icon}
                </div>
                <span className="cd-journey__label">{node.label}</span>
                <span className="cd-journey__date">{node.date}</span>
                {i < journeyNodes.length - 1 && <div className="cd-journey__line"></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cd-grid">
        {/* RFM Breakdown */}
        <div className="glass-card cd-rfm">
          <h3 className="cd-section-title">RFM Breakdown</h3>
          <div className="cd-rfm__bars">
            {[
              { label: 'Recency', value: lb.recency_score || 0, color: '#10b981' },
              { label: 'Frequency', value: lb.frequency_score || 0, color: '#3b82f6' },
              { label: 'Monetary', value: lb.monetary_score || 0, color: '#f59e0b' },
            ].map(b => (
              <div key={b.label} className="cd-rfm__bar-row">
                <span className="cd-rfm__bar-label">{b.label}</span>
                <div className="cd-rfm__bar-track">
                  <div
                    className="cd-rfm__bar-fill"
                    style={{ width: `${b.value}%`, background: b.color }}
                  ></div>
                </div>
                <span className="cd-rfm__bar-value">{b.value}</span>
              </div>
            ))}
          </div>
          <div className="cd-rfm__categories">
            <span className="cd-rfm__cat-label">Top Categories:</span>
            <div className="cd-rfm__cat-list">
              {categories.map(c => (
                <span key={c} className="cd-rfm__cat-tag">{c}</span>
              ))}
            </div>
          </div>
        </div>

        {/* AI Insights */}
        <div className="glass-card cd-ai">
          <h3 className="cd-section-title">🤖 AI Insights</h3>
          <div className="cd-ai__actions">
            <button className="btn btn-primary btn-sm" onClick={generateSummary} disabled={aiLoading.summary}>
              {aiLoading.summary ? <><span className="loading-spinner"></span> Generating...</> : '📊 Customer Summary'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={generateEmail} disabled={aiLoading.email}>
              {aiLoading.email ? <><span className="loading-spinner"></span> Drafting...</> : '✉️ Draft Email'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={generateAction} disabled={aiLoading.action}>
              {aiLoading.action ? <><span className="loading-spinner"></span> Thinking...</> : '🎯 Next Best Action'}
            </button>
          </div>

          {summary && (
            <div className="cd-ai__result animate-fade-in">
              <h4>📊 Customer Summary</h4>
              <p>{summary}</p>
            </div>
          )}

          {email && (
            <div className="cd-ai__result cd-ai__email animate-fade-in">
              <h4>✉️ Email Draft</h4>
              <div className="cd-email-preview">
                <div className="cd-email-subject">
                  <strong>Subject:</strong> {email.subject}
                </div>
                <div className="cd-email-body">{email.body}</div>
              </div>
            </div>
          )}

          {action && (
            <div className="cd-ai__result animate-fade-in">
              <h4>🎯 Next Best Action</h4>
              <p>{action}</p>
            </div>
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className="glass-card cd-orders">
        <h3 className="cd-section-title">Order History ({orders.length})</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Items</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const items = o.items_json ? JSON.parse(o.items_json) : [];
              return (
                <tr key={o.id}>
                  <td>{formatDate(o.date)}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {items.map(i => i.name).join(', ')}
                  </td>
                  <td style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>
                    {formatCurrency(o.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Events Timeline */}
      {events.length > 0 && (
        <div className="glass-card cd-events">
          <h3 className="cd-section-title">Event Timeline</h3>
          <div className="cd-timeline">
            {events.slice(0, 15).map(ev => {
              let meta = null;
              try { meta = JSON.parse(ev.metadata_json); } catch {}
              return (
                <div key={ev.id} className={`cd-timeline__item ${ev.type === 'tier_changed' ? 'cd-timeline__item--highlight' : ''}`}>
                  <div className={`cd-timeline__dot ${ev.type === 'tier_changed' ? 'cd-timeline__dot--upgrade' : ''}`}></div>
                  <div className="cd-timeline__content">
                    <span className="cd-timeline__type">
                      {EVENT_ICONS[ev.type] || '📌'} {ev.type.replace(/_/g, ' ')}
                      {ev.type === 'tier_changed' && meta && (
                        <span className="cd-timeline__meta"> ({meta.from} → {meta.to})</span>
                      )}
                    </span>
                    <span className="cd-timeline__time">{formatRelativeDate(ev.timestamp)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Build journey milestones from customer data + events
function buildJourney(customer, events, orders) {
  const nodes = [];
  const tierColors = { Bronze: '#b45309', Silver: '#64748b', Gold: '#ca8a04', 'Churn Risk': '#dc2626' };

  // First visit / registered
  if (customer.created_at) {
    nodes.push({
      icon: '👋', label: 'Registered',
      date: formatDate(customer.created_at),
      color: '#7c3aed', highlight: false
    });
  }

  // First order
  if (customer.first_order_date) {
    nodes.push({
      icon: '🛒', label: 'First Order',
      date: formatDate(customer.first_order_date),
      color: '#10b981', highlight: false
    });
  }

  // Tier changes from events
  const tierChanges = events
    .filter(e => e.type === 'tier_changed')
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  tierChanges.forEach(ev => {
    try {
      const meta = JSON.parse(ev.metadata_json);
      const upgraded = TIER_RANK[meta.to] > TIER_RANK[meta.from];
      nodes.push({
        icon: upgraded ? '⬆️' : '⬇️',
        label: `${meta.from} → ${meta.to}`,
        date: formatRelativeDate(ev.timestamp),
        color: tierColors[meta.to] || '#7c3aed',
        highlight: upgraded
      });
    } catch {}
  });

  // Most recent order
  if (customer.last_order_date && customer.last_order_date !== customer.first_order_date) {
    nodes.push({
      icon: '🛍️', label: `Order #${customer.total_orders}`,
      date: formatDate(customer.last_order_date),
      color: '#3b82f6', highlight: false
    });
  }

  // Current status
  nodes.push({
    icon: customer.loyalty_tier === 'Gold' ? '👑' : customer.loyalty_tier === 'Churn Risk' ? '⚠️' : '🎯',
    label: `${customer.loyalty_tier} (${customer.loyalty_score}pts)`,
    date: 'Now',
    color: tierColors[customer.loyalty_tier] || '#7c3aed',
    highlight: customer.loyalty_tier === 'Gold'
  });

  return nodes;
}

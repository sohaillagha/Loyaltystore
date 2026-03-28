import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { formatCurrency, formatNumber } from '../utils/formatters';
import StatsCard from '../components/StatsCard';
import TierBadge from '../components/TierBadge';
import './DashboardPage.css';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const api = useApi();
  const navigate = useNavigate();

  const loadStats = async () => {
    try {
      const data = await api.getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.runSync();
      await loadStats();
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (!stats || stats.totalCustomers === 0) {
    return (
      <div className="dashboard-empty">
        <div className="dashboard-empty__icon">🚀</div>
        <h2>Welcome to ShopCRM</h2>
        <p>Sync your WooCommerce data to get started</p>
        <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
          {syncing ? (
            <>
              <span className="loading-spinner"></span>
              Syncing...
            </>
          ) : '🔄 Sync WooCommerce Data'}
        </button>
      </div>
    );
  }

  const tierMap = {};
  stats.tierDistribution?.forEach(t => { tierMap[t.tier] = t.count; });

  return (
    <div className="dashboard">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Dashboard</h1>
          <p>Loyalty CRM overview — real-time customer insights</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleSync} disabled={syncing}>
          {syncing ? '⏳ Syncing...' : '🔄 Re-sync'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid">
        <StatsCard
          icon="👥"
          label="Total Customers"
          value={formatNumber(stats.totalCustomers)}
          subtext={`${stats.totalOrders} total orders`}
          color="purple"
        />
        <StatsCard
          icon="💰"
          label="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          subtext="Lifetime value"
          color="teal"
        />
        <StatsCard
          icon="⭐"
          label="Avg. Loyalty Score"
          value={`${stats.avgScore}/100`}
          subtext="Across all customers"
          color="gold"
        />
        <StatsCard
          icon="🏆"
          label="Gold Members"
          value={tierMap['Gold'] || 0}
          subtext={`${tierMap['Churn Risk'] || 0} at risk`}
          color="pink"
        />
      </div>

      <div className="dashboard__grid">
        {/* Tier Distribution */}
        <div className="glass-card dashboard__tier-chart">
          <h3 className="dashboard__section-title">Tier Distribution</h3>
          <div className="tier-bars">
            {[
              { tier: 'Gold', count: tierMap['Gold'] || 0, color: 'var(--tier-gold)' },
              { tier: 'Silver', count: tierMap['Silver'] || 0, color: 'var(--tier-silver)' },
              { tier: 'Bronze', count: tierMap['Bronze'] || 0, color: 'var(--tier-bronze)' },
              { tier: 'Churn Risk', count: tierMap['Churn Risk'] || 0, color: 'var(--tier-churn)' },
            ].map(t => (
              <div key={t.tier} className="tier-bar-row">
                <div className="tier-bar-label">
                  <TierBadge tier={t.tier} />
                  <span className="tier-bar-count">{t.count}</span>
                </div>
                <div className="tier-bar-track">
                  <div
                    className="tier-bar-fill"
                    style={{
                      width: `${(t.count / stats.totalCustomers) * 100}%`,
                      background: t.color,
                      boxShadow: `0 0 12px ${t.color}40`
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Customers */}
        <div className="glass-card dashboard__top-customers">
          <h3 className="dashboard__section-title">Top Customers</h3>
          <div className="top-customers-list">
            {stats.topCustomers?.map((c, i) => (
              <div
                key={c.id}
                className="top-customer-row"
                onClick={() => navigate(`/customers/${c.id}`)}
              >
                <div className="top-customer-rank">#{i + 1}</div>
                <div className="top-customer-info">
                  <span className="top-customer-name">{c.name}</span>
                  <span className="top-customer-spend">{formatCurrency(c.total_spent)}</span>
                </div>
                <TierBadge tier={c.loyalty_tier} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="glass-card dashboard__recent-orders">
        <h3 className="dashboard__section-title">Recent Orders</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Tier</th>
              <th>Date</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentOrders?.slice(0, 8).map(o => (
              <tr key={o.id} onClick={() => navigate(`/customers/${o.customer_id}`)}>
                <td>{o.customer_name}</td>
                <td><TierBadge tier={o.loyalty_tier} /></td>
                <td>{o.date}</td>
                <td style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>
                  {formatCurrency(o.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

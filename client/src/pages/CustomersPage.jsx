import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { formatCurrency, formatDate } from '../utils/formatters';
import TierBadge from '../components/TierBadge';
import './CustomersPage.css';

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [sort, setSort] = useState('loyalty_score');
  const api = useApi();
  const navigate = useNavigate();

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const params = { sort, order: 'desc' };
      if (tierFilter) params.tier = tierFilter;
      if (search) params.search = search;
      const data = await api.getCustomers(params);
      setCustomers(data);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCustomers(); }, [tierFilter, sort]);

  const handleSearch = (e) => {
    e.preventDefault();
    loadCustomers();
  };

  return (
    <div className="customers-page">
      <div className="page-header">
        <h1>Customers</h1>
        <p>360° view of all loyalty customers</p>
      </div>

      {/* Filters */}
      <div className="customers-filters glass-card">
        <form onSubmit={handleSearch} className="customers-search">
          <input
            type="text"
            className="input"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm">Search</button>
        </form>

        <div className="customers-filter-group">
          <select
            className="select"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
          >
            <option value="">All Tiers</option>
            <option value="Gold">Gold</option>
            <option value="Silver">Silver</option>
            <option value="Bronze">Bronze</option>
            <option value="Churn Risk">Churn Risk</option>
          </select>

          <select
            className="select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="loyalty_score">Sort by Score</option>
            <option value="total_spent">Sort by Spend</option>
            <option value="total_orders">Sort by Orders</option>
            <option value="last_order_date">Sort by Recency</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
      </div>

      {/* Customer Table */}
      <div className="glass-card customers-table-card">
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading customers...</p>
          </div>
        ) : (
          <table className="data-table" id="customers-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Email</th>
                <th>Tier</th>
                <th>Score</th>
                <th>Orders</th>
                <th>Total Spent</th>
                <th>Last Order</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id} onClick={() => navigate(`/customers/${c.id}`)}>
                  <td>{c.name}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{c.email}</td>
                  <td><TierBadge tier={c.loyalty_tier} /></td>
                  <td>
                    <div className="score-bar-inline">
                      <div className="score-bar-fill" style={{ width: `${c.loyalty_score}%` }}></div>
                      <span>{c.loyalty_score}</span>
                    </div>
                  </td>
                  <td>{c.total_orders}</td>
                  <td style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>
                    {formatCurrency(c.total_spent)}
                  </td>
                  <td>{formatDate(c.last_order_date)}</td>
                  <td style={{ color: 'var(--accent-purple)', fontWeight: 500 }}>
                    {c.loyalty_points?.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && customers.length === 0 && (
          <div className="loading-container">
            <p>No customers found. Try adjusting your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}

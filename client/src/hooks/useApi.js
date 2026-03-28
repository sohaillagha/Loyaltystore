const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

export async function fetchApi(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export function useApi() {
  return {
    // Stats
    getStats: () => fetchApi('/customers/stats'),

    // Customers
    getCustomers: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return fetchApi(`/customers?${qs}`);
    },
    getCustomer: (id) => fetchApi(`/customers/${id}`),
    getCustomerOrders: (id) => fetchApi(`/customers/${id}/orders`),
    getCustomerEvents: (id) => fetchApi(`/customers/${id}/events`),

    // Sync
    runSync: () => fetchApi('/sync', { method: 'POST' }),
    recalculate: () => fetchApi('/sync/loyalty/recalculate', { method: 'POST' }),

    // AI
    getSummary: (id) => fetchApi(`/ai/summary/${id}`, { method: 'POST' }),
    getEmail: (id) => fetchApi(`/ai/email/${id}`, { method: 'POST' }),
    getAction: (id) => fetchApi(`/ai/action/${id}`, { method: 'POST' }),
    explainScore: (id) => fetchApi(`/ai/explain-score/${id}`, { method: 'POST' }),

    // Chat
    getChatProfiles: () => fetchApi('/chat/profiles'),
    startChat: (customerId, productContext) =>
      fetchApi('/chat/start', {
        method: 'POST',
        body: JSON.stringify({ customerId, productContext }),
      }),
    sendChatMessage: (sessionId, message) =>
      fetchApi('/chat/message', {
        method: 'POST',
        body: JSON.stringify({ sessionId, message }),
      }),
    getChatSession: (id) => fetchApi(`/chat/session/${id}`),
  };
}

(function() {
  const BASE = localStorage.getItem('kseb_api_base') || 'http://localhost:8080';

  async function request(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = window.Auth?.getToken?.();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(`${BASE}${path}`, Object.assign({}, opts, { headers }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (res.status === 204) return null;
      return await res.json();
    } catch (err) {
      console.warn('API error; falling back to simulator', err);
      throw err;
    }
  }

  // High-level endpoints
  async function fetchLiveVoltage() { return request('/api/live'); }
  async function fetchAlerts() { return request('/api/alerts'); }
  async function fetchDevices() { return request('/api/devices'); }

  window.API = { request, fetchLiveVoltage, fetchAlerts, fetchDevices, BASE };
})();



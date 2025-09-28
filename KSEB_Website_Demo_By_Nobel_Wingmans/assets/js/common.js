// Shared utilities across pages
(function() {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const clockEl = document.getElementById('liveClock');
  if (clockEl) {
    const updateClock = () => {
      clockEl.textContent = new Date().toLocaleString();
    };
    updateClock();
    setInterval(updateClock, 1000);
  }

  // Simple pub/sub to share simulated backend events
  const bus = (function() {
    const listeners = {};
    return {
      on(event, cb) {
        (listeners[event] ||= []).push(cb);
      },
      emit(event, data) {
        (listeners[event] || []).forEach(cb => cb(data));
      }
    };
  })();
  window.AppBus = bus;

  // Simple toast notifications
  const tc = document.createElement('div');
  tc.className = 'toast-container';
  document.body.appendChild(tc);
  window.showToast = function(message, level, onClick) {
    const t = document.createElement('div');
    t.className = `toast ${level||''}`;
    t.textContent = message;
    if (onClick) { t.style.cursor = 'pointer'; t.addEventListener('click', () => { try { onClick(); } catch(e){} tc.removeChild(t); }); }
    tc.appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(6px)'; }, 2600);
    setTimeout(()=> tc.removeChild(t), 3000);
  }

  // Auth removed: pages are always accessible; API usage is optional.

  // Simulated data source with coordinates in Kerala
  const devices = [
    { id: 'SHIELD-001', name: 'S&H', firmware: '2.1.4', location: 'S&H (Science & Humanities)', coords: [11.271763, 77.606255], signal: 95 },
    { id: 'SHIELD-002', name: 'MTS',  firmware: '2.1.4', location: 'Mechatronics Block', coords: [11.270545, 77.603761], signal: 88 },
    { id: 'SHIELD-003', name: 'ECE',    firmware: '2.1.4', location: 'Electronics & Communication Engineering Block', coords: [11.272222, 77.605406], signal: 82 },
    { id: 'SHIELD-004', name: 'FT',   firmware: '2.1.4', location: 'Food Tech Block', coords: [11.272541, 77.607353], signal: 75 },
  ];
  window.Devices = devices;

  // Simulate uptime/reboot times
  devices.forEach((d, idx) => {
    const hoursAgo = 24 + idx * 12; // deterministic per sensor
    d.lastReboot = new Date(Date.now() - hoursAgo * 3600 * 1000);
    d.uptimeMs = Date.now() - d.lastReboot.getTime();
  });

  // Health from voltage (target 230V ±3% ~ 223V–237V). Warn at ≥235V per requirement.
  window.computeHealth = function(voltage) {
    if (voltage == null || !isFinite(voltage)) return { label: 'NORMAL', class: '' };
    // Hard danger bounds for electrical safety
    if (voltage < 200 || voltage > 260) return { label: 'SERVICE REQUIRED', class: 'danger' };
    // Warning if reaching 235V or above (upper band) but below danger
    if (voltage >= 235 && voltage <= 260) return { label: 'SERVICE SOON', class: 'warn' };
    // Optionally could warn if far below nominal (e.g., <223V). Keeping normal unless <200 triggers danger.
    return { label: 'NORMAL', class: '' };
  }
})();




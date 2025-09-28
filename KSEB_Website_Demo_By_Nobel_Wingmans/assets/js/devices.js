(function() {
  const container = document.getElementById('deviceCards');
  const counts = { healthy: 0, soon: 0, required: 0 };

  function uptimeString(ms) {
    const sec = Math.floor(ms / 1000);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  }

  function serviceClass(health) {
    if (health.class === 'danger') return 'service-required';
    if (health.class === 'warn') return 'service-soon';
    return 'service-healthy';
  }

  let map;
  const markerById = {};
  let currentTileLayer = null;
  let isSatelliteView = false;

  // Function to check if coordinates are in Kochi area
  function isInKochiArea(coords) {
    if (!coords || coords.length < 2) return false;
    const [lat, lng] = coords;
    // Kochi area bounds: roughly 9.8-10.0 lat, 76.1-76.4 lng
    return lat >= 9.8 && lat <= 10.0 && lng >= 76.1 && lng <= 76.4;
  }
  async function loadDevices() {
    // Always show the 4 fixed KSEB sensors defined in common.js for the Device Status page
    let list = window.Devices || [];
    container.innerHTML = '';
    const q = (document.getElementById('deviceSearch')?.value || '').toLowerCase();
    if (q) {
      list = list.filter(d =>
        (d.name||'').toLowerCase().includes(q) ||
        (d.id||'').toLowerCase().includes(q) ||
        (d.location||'').toLowerCase().includes(q)
      );
    }
    
    // Filter out devices from Kochi area
    list = list.filter(d => !isInKochiArea(d.coords));
    counts.healthy = counts.soon = counts.required = 0;

    list.forEach((d, idx) => {
    const voltage = 220 + (idx*3) + (Math.random()*10-5);
    const health = window.computeHealth(voltage);
    const state = serviceClass(health);
      d.healthLabel = health.label;
    if (state === 'service-healthy') counts.healthy++; else if (state === 'service-soon') counts.soon++; else counts.required++;

    const card = document.createElement('div');
    card.className = 'device-card';
    
    // Add blinking animation for S&H sensor (SHIELD-001)
    if (d.id === 'SHIELD-001') {
      card.classList.add('blinking');
    }
    card.innerHTML = `
      <div class="device-header">
        <div class="device-title">${d.name}</div>
        <span class="service-chip ${state}">${health.label.replace('SERVICE ', '') || 'HEALTHY'}</span>
      </div>
      <div class="kv"><strong>Device ID</strong><span>${d.id}</span></div>
      <div class="kv"><strong>Firmware</strong><span>${d.firmware}</span></div>
      <div class="kv"><strong>Last Reboot</strong><span>${d.lastReboot.toLocaleString()}</span></div>
      <div class="kv"><strong>Uptime</strong><span>${uptimeString(d.uptimeMs)}</span></div>
      
      <div class="kv"><strong>Location</strong><span>${d.location}</span></div>
      <div class="kv"><strong>Live Voltage</strong><span>${voltage.toFixed(2)} V</span></div>
      <button class="focus-btn" data-id="${d.id}">Focus on map</button>
    `;
      // Click card or button to zoom map to device and highlight card
      const focus = () => {
        location.hash = '#devices';
        setTimeout(() => {
          if (map) {
            map.setView(d.coords, 19, { animate: true });
            const m = markerById[d.id];
            if (m) m.openPopup();
          }
          document.querySelectorAll('.device-card.focused').forEach(el => el.classList.remove('focused'));
          card.classList.add('focused');
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          window.showToast(`${d.name} focused on map`, 'warn');
        }, 80);
      };
      card.style.cursor = 'pointer';
      card.addEventListener('click', focus);
      card.querySelector('.focus-btn').addEventListener('click', (e)=>{ e.stopPropagation(); focus(); });
      container.appendChild(card);

    if (state === 'service-required') {
      window.AppBus.emit('alert', { id: `${d.id}-svc`, title: 'Service Required', deviceId: d.id, location: d.location, coords: d.coords, severity: 'danger', timestamp: new Date() });
    }
    });

    // Totals
    document.getElementById('countHealthy').textContent = counts.healthy;
    document.getElementById('countSoon').textContent = counts.soon;
    document.getElementById('countRequired').textContent = counts.required;

    // Map
    function ensureMap() {
      const el = document.getElementById('mapDevices');
      if (!el) return null;
      if (!map) {
        map = L.map(el).setView([10.1632, 76.6413], 8);
        // Default to OpenStreetMap
        currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
          maxZoom: 19, 
          attribution: '© OpenStreetMap' 
        }).addTo(map);
      } else {
        map.invalidateSize();
      }
      return map;
    }
    const m = ensureMap();
    if (m) {
      list.forEach(d => {
        const html = `<strong>${d.name}</strong><br>${d.id}<br>${d.location}<br><em>${(d.healthLabel||'HEALTHY')}</em>`;
        const marker = L.marker(d.coords).addTo(m).bindPopup(html);
        
        // Add blinking effect to S&H sensor marker (SHIELD-001)
        if (d.id === 'SHIELD-001') {
          const icon = marker.getElement();
          if (icon) {
            icon.classList.add('blinking-marker');
          }
        }
        
        markerById[d.id] = marker;
      });
      // Fit all markers; do not auto-redirect/pan on click
      const all = Object.values(markerById);
      if (all.length) {
        const group = L.featureGroup(all);
        m.fitBounds(group.getBounds().pad(0.2));
      }
    }
  }

  // Satellite toggle functionality
  function toggleSatelliteView() {
    if (!map) return;
    
    // Remove current tile layer
    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
    }
    
    if (isSatelliteView) {
      // Switch to normal view
      currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        maxZoom: 19, 
        attribution: '© OpenStreetMap' 
      }).addTo(map);
      document.getElementById('satelliteToggleDevices').textContent = '🛰️ Satellite';
      document.getElementById('satelliteToggleDevices').classList.remove('active');
    } else {
      // Switch to satellite view
      currentTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '© Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
      }).addTo(map);
      document.getElementById('satelliteToggleDevices').textContent = '🗺️ Normal';
      document.getElementById('satelliteToggleDevices').classList.add('active');
    }
    
    isSatelliteView = !isSatelliteView;
  }

  loadDevices();
  document.getElementById('deviceSearch')?.addEventListener('input', () => loadDevices());
  document.getElementById('satelliteToggleDevices')?.addEventListener('click', toggleSatelliteView);
  window.initDevicesMap = () => { if (map) map.invalidateSize(); };
})();




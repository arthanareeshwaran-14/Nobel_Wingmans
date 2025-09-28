(function() {
  const feed = document.getElementById('alertsFeed');

  const allAlerts = [];
  function renderReport(){
    const el = document.getElementById('alertReport');
    if (!el) return;
    const total = allAlerts.length;
    const warns = allAlerts.filter(a=>a.severity==='warning').length;
    const crit = allAlerts.filter(a=>a.severity==='danger').length;
    el.textContent = `Total: ${total} • Warnings: ${warns} • Critical: ${crit}`;
  }

  // Function to check if coordinates are in Kochi area
  function isInKochiArea(coords) {
    if (!coords || coords.length < 2) return false;
    const [lat, lng] = coords;
    // Kochi area bounds: roughly 9.8-10.0 lat, 76.1-76.4 lng
    return lat >= 9.8 && lat <= 10.0 && lng >= 76.1 && lng <= 76.4;
  }

  function addAlert(item) {
    // Skip alerts from Kochi area
    if (isInKochiArea(item.coords)) {
      return;
    }
    
    const div = document.createElement('div');
    div.className = `alert-item ${item.severity === 'danger' ? 'alert-danger' : item.severity === 'warning' ? 'alert-warning' : ''}`;
    div.innerHTML = `
      <div class="alert-title">${item.title}</div>
      <div class="alert-meta">${item.deviceId} • ${item.location} • ${new Date(item.timestamp).toLocaleString()}</div>
    `;
    div.addEventListener('click', () => {
      location.hash = '#alerts';
      setTimeout(()=>{ if (item.coords && map) map.setView(item.coords, 19, { animate: true }); }, 50);
    });
    feed.prepend(div);
    // Popup only for current spike unauthorized fence
    if (item.type === 'current_spike' && item.severity === 'danger') {
      window.showToast('Unauthorized electric fence detected', 'danger', () => {
        location.hash = '#alerts';
        setTimeout(()=>{ if (item.coords && map) { map.setView(item.coords, 19, { animate: true }); } }, 50);
      });
    }
    allAlerts.push(item);
    renderReport();
  }

  // Map
  let map, tile, markers = {};
  let currentTileLayer = null;
  let isSatelliteView = false;
  function addInitialMarkers() {
    if (!map) return;
    (window.Devices || []).forEach(d => {
      if (!d.coords) return;
      if (!markers[d.id]) {
        const html = `<strong>${d.name}</strong><br>${d.id}<br>${d.location}`;
        const marker = L.marker(d.coords).addTo(map).bindPopup(html);
        
        // Add blinking effect to S&H sensor marker (SHIELD-001)
        if (d.id === 'SHIELD-001') {
          const icon = marker.getElement();
          if (icon) {
            icon.classList.add('blinking-marker');
          }
        }
        
        markers[d.id] = marker;
      }
    });
    // Fit bounds if we have any markers
    const all = Object.values(markers);
    if (all.length) {
      const group = L.featureGroup(all);
      map.fitBounds(group.getBounds().pad(0.2));
    }
  }
  function initMap() {
    const el = document.getElementById('mapAlerts');
    if (!el) return;
    if (!map) {
      map = L.map(el).setView([10.1632, 76.6413], 8);
      // Default to OpenStreetMap
      currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        maxZoom: 19, 
        attribution: '© OpenStreetMap' 
      }).addTo(map);
      addInitialMarkers();
    } else {
      map.invalidateSize();
      addInitialMarkers();
    }
  }
  function upsertMarker(item) {
    // Skip markers from Kochi area
    if (isInKochiArea(item.coords)) {
      return;
    }
    
    const key = item.deviceId;
    const color = item.severity === 'danger' ? 'red' : item.severity === 'warning' ? 'orange' : 'blue';
    const html = `<span style="background:${color}; width:12px; height:12px; display:inline-block; border-radius:50%; margin-right:6px;"></span>${item.title}`;
    if (!item.coords) return;
    if (!markers[key]) {
      const marker = L.marker(item.coords).addTo(map).bindPopup(html);
      
      // Add blinking effect to S&H sensor marker (SHIELD-001)
      if (key === 'SHIELD-001') {
        const icon = marker.getElement();
        if (icon) {
          icon.classList.add('blinking-marker');
        }
      }
      
      markers[key] = marker;
    } else {
      markers[key].setLatLng(item.coords).setPopupContent(html);
    }
    if (map) map.setView(item.coords, 19, { animate: true });
  }

  // Poll API periodically and listen to bus
  async function pollAlerts() {
    try {
      const list = await window.API.fetchAlerts();
      (list || []).forEach(item => { addAlert(item); upsertMarker(item); });
    } catch {
      // ignore; simulator will push via bus
    }
  }
  setInterval(pollAlerts, 5000);
  pollAlerts();
  initMap();
  window.initAlertsMap = initMap;

  // Export CSV
  function toCsv(rows){
    const header = ['id','title','deviceId','location','lat','lng','severity','timestamp'];
    const escape = (v)=>`"${String(v??'').replace(/"/g,'""')}"`;
    const data = allAlerts.map(a=>[a.id,a.title,a.deviceId,a.location,a.coords?.[0],a.coords?.[1],a.severity,a.timestamp].map(escape).join(','));
    return header.join(',')+'\n'+data.join('\n');
  }
  document.getElementById('btnExportCsv')?.addEventListener('click', ()=>{
    const blob = new Blob([toCsv(allAlerts)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'alerts.csv'; a.click();
    URL.revokeObjectURL(url);
  });

  // Follow selected sensor
  let follow = true; let lastCoords = null;
  const ft = document.getElementById('followToggle');
  if (ft) ft.checked = true;
  document.getElementById('followToggle')?.addEventListener('change', (e)=>{ follow = e.target.checked; });
  window.AppBus.on('alert', (item)=>{ 
    lastCoords = item.coords; 
    if(follow && map && lastCoords && !isInKochiArea(lastCoords)) {
      map.setView(lastCoords, 19, { animate: true }); 
    }
  });

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
      document.getElementById('satelliteToggleAlerts').textContent = '🛰️ Satellite';
      document.getElementById('satelliteToggleAlerts').classList.remove('active');
    } else {
      // Switch to satellite view
      currentTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '© Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
      }).addTo(map);
      document.getElementById('satelliteToggleAlerts').textContent = '🗺️ Normal';
      document.getElementById('satelliteToggleAlerts').classList.add('active');
    }
    
    isSatelliteView = !isSatelliteView;
  }

  // Listen to bus (simulator)
  window.AppBus.on('alert', (item) => {
    addAlert(item);
    upsertMarker(item);
  });

  // Seed with a few alerts for demo
  setTimeout(() => {
    const d = window.Devices[2];
    const seed = { id: 'seed1', title: 'System initialized. Click "Start Live Data" to begin monitoring.', deviceId: 'System', location: 'Control Room', coords: d.coords, severity: 'info', timestamp: new Date() };
    addAlert(seed);
  }, 200);

  // Add satellite toggle event listener
  document.getElementById('satelliteToggleAlerts')?.addEventListener('click', toggleSatelliteView);
})();




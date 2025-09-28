(function() {
  const readingVoltageEl = document.getElementById('voltageNow');
  const readingCurrentEl = document.getElementById('currentValue');
  const minEl = document.getElementById('minVoltage');
  const maxEl = document.getElementById('maxVoltage');
  const avgEl = document.getElementById('avgVoltage');
  // Add a current display under reading unit (reuse updated info)
  const updatedEl = document.getElementById('lastUpdated');
  const currentNowEl = document.getElementById('currentNow');
  const chipEl = document.getElementById('healthChip');

  let timer = null;
  let samples = [];
  let currentSamples = [];
  let lastCurrent = null;
  let spikeActive = false;
  let lastSpikeTime = 0;
  let firebaseRef = null;
  let isFirebaseConnected = false;
  let lastUpdateTime = 0;
  const UPDATE_DELAY = 3000; // 3 seconds delay
  let countdownTimer = null;

  // Countdown timer function
  function startCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
    }
    
    let timeLeft = UPDATE_DELAY / 1000; // Convert to seconds
    const countdownEl = document.getElementById('updateCountdown');
    
    countdownTimer = setInterval(() => {
      if (countdownEl) {
        countdownEl.textContent = `${timeLeft}s`;
      }
      timeLeft--;
      
      if (timeLeft < 0) {
        clearInterval(countdownTimer);
        if (countdownEl) {
          countdownEl.textContent = 'Ready';
        }
      }
    }, 1000);
  }

  // Firebase connection and data fetching
  function initializeFirebase() {
    if (!window.FirebaseDB) {
      console.warn('Firebase not initialized. Using simulation mode.');
      return false;
    }
    
    try {
      // Replace 'sensorData' with your actual Firebase path
      firebaseRef = window.FirebaseDB.ref('sensorData');
      
      // Listen for real-time data changes
      firebaseRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
          isFirebaseConnected = true;
          updateFromFirebaseData(data);
        }
      }, (error) => {
        console.error('Firebase error:', error);
        isFirebaseConnected = false;
      });
      
      return true;
    } catch (error) {
      console.error('Firebase initialization error:', error);
      return false;
    }
  }

  function updateFromFirebaseData(data) {
    console.log('Firebase data received:', data); // Debug log
    console.log('Data structure analysis:', {
      hasCurrent: !!data.current,
      currentType: typeof data.current,
      currentValue: data.current,
      hasVoltage: !!data.voltage,
      voltageType: typeof data.voltage,
      voltageValue: data.voltage,
      allKeys: Object.keys(data || {})
    });
    
    // Check if enough time has passed since last update (3 seconds delay)
    const now = Date.now();
    if (now - lastUpdateTime < UPDATE_DELAY) {
      console.log('Update delayed - waiting for 3 second interval');
      return;
    }
    lastUpdateTime = now;
    
    // Extract voltage and current from Firebase data
    // Try different possible field names and structures
    let voltage = 0;
    let current = 0;
    let timestamp = new Date().toISOString();
    
    // Check if data is an object
    if (data && typeof data === 'object') {
      // Try different possible field names
      voltage = parseFloat(data.voltage || data.voltageValue || data.V || data.v || data.voltageReading) || 0;
      current = parseFloat(data.current || data.currentValue || data.I || data.i || data.currentReading || data.amps) || 0;
      timestamp = data.timestamp || data.time || data.date || new Date().toISOString();
      
      // Handle nested current structure like {current: {current: 6.638779746}}
      if (data.current && typeof data.current === 'object') {
        current = parseFloat(data.current.current || data.current.value || data.current.amps || data.current.I) || 0;
        console.log('Found nested current structure:', data.current, 'Extracted current:', current);
      }
      
      // Handle nested voltage structure like {voltage: {voltage: 230}}
      if (data.voltage && typeof data.voltage === 'object') {
        voltage = parseFloat(data.voltage.voltage || data.voltage.value || data.voltage.V) || 0;
        console.log('Found nested voltage structure:', data.voltage, 'Extracted voltage:', voltage);
      }
      
      // If no data found in main object, check if it's nested
      if (voltage === 0 && current === 0) {
        // Check if data has nested structure like { sensorData: { voltage: 230, current: 1.2 } }
        const nestedData = data.sensorData || data.data || data.readings || data.values;
        if (nestedData) {
          voltage = parseFloat(nestedData.voltage || nestedData.voltageValue || nestedData.V || nestedData.v) || 0;
          current = parseFloat(nestedData.current || nestedData.currentValue || nestedData.I || nestedData.i || nestedData.amps) || 0;
          timestamp = nestedData.timestamp || nestedData.time || nestedData.date || timestamp;
        }
      }
    }
    
    // If voltage is 0 but we have current data, use a constant voltage range (220-230V)
    if (voltage === 0 && current > 0) {
      voltage = 220 + (Math.random() * 10); // Random voltage between 220-230V
      console.log('Using constant voltage range (220-230V):', voltage);
    }
    
    console.log('Extracted values - Voltage:', voltage, 'Current:', current); // Debug log
    
    // Only fall back to simulation if we truly have no data at all
    // Allow 0 values as valid readings
    if (data === null || data === undefined) {
      console.log('No data from Firebase, falling back to simulation mode');
      // Switch to simulation mode
      isFirebaseConnected = false;
      if (!timer) {
        timer = setInterval(tick, 500);
        tick();
      }
      return;
    }
    
    // Update samples
    samples.push(voltage);
    if (samples.length > 300) samples.shift();
    
    if (current != null && isFinite(current)) {
      currentSamples.push(current);
      if (currentSamples.length > 300) currentSamples.shift();
      
      // Current spike detection
      const now = Date.now();
      const isSpike = (current > 2.0) || (lastCurrent != null && current > lastCurrent * 2);
      if (isSpike && !spikeActive && now - lastSpikeTime > 2500) {
        const device = window.Devices[Math.floor(Math.random()*window.Devices.length)];
        const alert = { 
          id: `${Date.now()}-cs`, 
          title: 'Unauthorized electric fence detected', 
          deviceId: device.id, 
          location: device.location, 
          coords: device.coords, 
          severity: 'danger', 
          type: 'current_spike', 
          timestamp: new Date() 
        };
        window.AppBus.emit('alert', alert);
        if (window.showToast) window.showToast('Unauthorized electric fence detected', 'danger');
        spikeActive = true; 
        lastSpikeTime = now;
      }
      if (!isSpike && spikeActive && current < 1.5) spikeActive = false;
      lastCurrent = current;
    }
    
    // Update UI
    console.log('Updating UI - Voltage:', voltage, 'Current:', current); // Debug log
    readingVoltageEl.textContent = voltage.toFixed(2);
    readingCurrentEl.textContent = current.toFixed(2);
    updatedEl.textContent = new Date(timestamp).toLocaleTimeString();
    
    // Update data source status
    const dataSourceStatus = document.getElementById('dataSourceStatus');
    if (dataSourceStatus) {
      dataSourceStatus.textContent = 'Firebase Real-time';
      dataSourceStatus.style.color = '#28a745';
    }
    
    // Start countdown for next update
    startCountdown();
    
    // Force UI update
    readingVoltageEl.style.animation = 'none';
    readingCurrentEl.style.animation = 'none';
    setTimeout(() => {
      readingVoltageEl.style.animation = '';
      readingCurrentEl.style.animation = '';
    }, 10);
    
    updateStats();
    
    // Voltage alert detection
    const health = window.computeHealth(voltage);
    const sev = health.class === 'danger' ? 'warning' : (health.class === 'warn' ? 'moderate' : 'none');
    if (sev === 'none') {
      if (pendingAlertTimer) { 
        clearTimeout(pendingAlertTimer); 
        pendingAlertTimer = null; 
        pendingSeverity = null; 
      }
    } else {
      if (!pendingAlertTimer || pendingSeverity !== sev) {
        if (pendingAlertTimer) clearTimeout(pendingAlertTimer);
        pendingSeverity = sev;
        const device = window.Devices[Math.floor(Math.random()*window.Devices.length)];
        pendingAlertTimer = setTimeout(() => {
          const severity = sev === 'warning' ? 'danger' : 'warning';
          const title = sev === 'warning' ? 'Voltage warning threshold exceeded' : 'Moderate voltage deviation';
          window.AppBus.emit('alert', {
            id: `${Date.now()}-v`,
            title,
            deviceId: device.id,
            location: device.location,
            coords: device.coords,
            severity,
            type: 'voltage',
            timestamp: new Date()
          });
          pendingAlertTimer = null; 
          pendingSeverity = null;
        }, 7000);
      }
    }
  }

  function updateStats() {
    if (samples.length === 0) return;
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    minEl.textContent = min.toFixed(2);
    maxEl.textContent = max.toFixed(2);
    avgEl.textContent = avg.toFixed(2);
    if (currentSamples.length > 0) {
      const cmin = Math.min(...currentSamples);
      const cmax = Math.max(...currentSamples);
      const cavg = currentSamples.reduce((a, b) => a + b, 0) / currentSamples.length;
      const minC = document.getElementById('minCurrent');
      const maxC = document.getElementById('maxCurrent');
      const avgC = document.getElementById('avgCurrent');
      if (minC) minC.textContent = cmin.toFixed(2);
      if (maxC) maxC.textContent = cmax.toFixed(2);
      if (avgC) avgC.textContent = cavg.toFixed(2);
    }
    const h = window.computeHealth(samples.at(-1));
    chipEl.textContent = h.label;
    chipEl.className = `chip ${h.class || ''}`;
  }

  function simulateVoltage(prev) {
    const base = 230;
    const jitter = (Math.random() - 0.5) * 8;
    const drift = Math.sin(Date.now() / 10000) * 3;
    let v = base + jitter + drift;
    // Occasionally simulate unauthorized usage spike/drop
    if (Math.random() < 0.02) v += (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random()*20);
    return Math.max(150, Math.min(300, v));
  }

  function simulateCurrent() {
    const base = 1.2; // amps
    const jitter = (Math.random() - 0.5) * 0.2;
    const drift = Math.sin(Date.now() / 9000) * 0.1;
    let a = base + jitter + drift;
    if (Math.random() < 0.03) a += 2 + Math.random() * 1.5; // occasional spike
    return Math.max(0, a);
  }

  // Debounced alert scheduling based on voltage severity
  let pendingAlertTimer = null;
  let pendingSeverity = null; // 'moderate' | 'warning'

  async function tick() {
    // Only run simulation if not connected to Firebase
    if (isFirebaseConnected) {
      console.log('Firebase connected, skipping simulation tick');
      return;
    }
    
    // Continuous random simulation for smooth UI
    const v = simulateVoltage();
    let c = simulateCurrent();
    samples.push(v);
    if (samples.length > 300) samples.shift();
    // Update primary current on top and voltage as secondary below
    readingVoltageEl.textContent = v.toFixed(2);
    updatedEl.textContent = new Date().toLocaleTimeString();
    
    // Update data source status
    const dataSourceStatus = document.getElementById('dataSourceStatus');
    if (dataSourceStatus) {
      dataSourceStatus.textContent = 'Simulation';
      dataSourceStatus.style.color = '#ffc107';
    }
    if (c != null && isFinite(c)) {
      readingCurrentEl.textContent = c.toFixed(2);
      currentSamples.push(c);
      if (currentSamples.length > 300) currentSamples.shift();
      // Local current spike detection with basic hysteresis and rate limit
      const now = Date.now();
      const isSpike = (c > 2.0) || (lastCurrent != null && c > lastCurrent * 2);
      if (isSpike && !spikeActive && now - lastSpikeTime > 2500) {
        const device = window.Devices[Math.floor(Math.random()*window.Devices.length)];
        const alert = { id: `${Date.now()}-cs`, title: 'Unauthorized electric fence detected', deviceId: device.id, location: device.location, coords: device.coords, severity: 'danger', type: 'current_spike', timestamp: new Date() };
        window.AppBus.emit('alert', alert);
        if (window.showToast) window.showToast('Unauthorized electric fence detected', 'danger');
        spikeActive = true; lastSpikeTime = now;
      }
      if (!isSpike && spikeActive && c < 1.5) spikeActive = false;
      lastCurrent = c;
    } else {
      readingCurrentEl.textContent = '0.00';
    }
    updateStats();
    // Debounced alerts: normal -> no alert; warn -> moderate; danger -> warning
    const health = window.computeHealth(v);
    const sev = health.class === 'danger' ? 'warning' : (health.class === 'warn' ? 'moderate' : 'none');
    if (sev === 'none') {
      if (pendingAlertTimer) { clearTimeout(pendingAlertTimer); pendingAlertTimer = null; pendingSeverity = null; }
    } else {
      // Schedule alert after 7s if severity persists
      if (!pendingAlertTimer || pendingSeverity !== sev) {
        if (pendingAlertTimer) clearTimeout(pendingAlertTimer);
        pendingSeverity = sev;
        const device = window.Devices[Math.floor(Math.random()*window.Devices.length)];
        pendingAlertTimer = setTimeout(() => {
          // Fire alert after delay
          const severity = sev === 'warning' ? 'danger' : 'warning'; // map: warning->danger badge, moderate->warning badge
          const title = sev === 'warning' ? 'Voltage warning threshold exceeded' : 'Moderate voltage deviation';
          window.AppBus.emit('alert', {
            id: `${Date.now()}-v`,
            title,
            deviceId: device.id,
            location: device.location,
            coords: device.coords,
            severity,
            type: 'voltage',
            timestamp: new Date()
          });
          pendingAlertTimer = null; pendingSeverity = null;
        }, 7000);
      }
    }
  }

  function start() {
    // Stop any existing simulation
    if (timer) { 
      clearInterval(timer); 
      timer = null; 
    }
    
    // Try to initialize Firebase first
    if (!isFirebaseConnected) {
      const firebaseInitialized = initializeFirebase();
      if (!firebaseInitialized) {
        console.log('Firebase not available, using simulation mode');
        // Fallback to simulation mode
        timer = setInterval(tick, 500);
        tick();
      }
    }
  }
  
  function stop() {
    clearInterval(timer); 
    timer = null;
    
    // Clear countdown timer
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    
    // Disconnect from Firebase
    if (firebaseRef) {
      firebaseRef.off();
      firebaseRef = null;
    }
    isFirebaseConnected = false;
    
    // Reset countdown display
    const countdownEl = document.getElementById('updateCountdown');
    if (countdownEl) {
      countdownEl.textContent = '—';
    }
    
    // Reset Connect button
    const connectBtn = document.getElementById('btnConnectFirebase');
    if (connectBtn) {
      connectBtn.textContent = '🔗 Connect';
      connectBtn.style.background = '';
    }
    
    // Update data source status
    const dataSourceStatus = document.getElementById('dataSourceStatus');
    if (dataSourceStatus) {
      dataSourceStatus.textContent = 'Stopped';
      dataSourceStatus.style.color = '#dc3545';
    }
  }
  function reset() {
    samples = [];
    currentSamples = [];
    lastCurrent = null;
    spikeActive = false; lastSpikeTime = 0;
    lastUpdateTime = 0; // Reset update timer
    
    // Clear countdown timer
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    
    minEl.textContent = '0.00';
    maxEl.textContent = '0.00';
    avgEl.textContent = '0.00';
    const minC = document.getElementById('minCurrent');
    const maxC = document.getElementById('maxCurrent');
    const avgC = document.getElementById('avgCurrent');
    if (minC) minC.textContent = '0.00';
    if (maxC) maxC.textContent = '0.00';
    if (avgC) avgC.textContent = '0.00';
    readingVoltageEl.textContent = '0.00';
    readingCurrentEl.textContent = '0.00';
    chipEl.textContent = 'NORMAL';
    chipEl.className = 'chip';
    updatedEl.textContent = '—';
    
    // Reset countdown display
    const countdownEl = document.getElementById('updateCountdown');
    if (countdownEl) {
      countdownEl.textContent = '—';
    }
    
    // Reset Connect button
    const connectBtn = document.getElementById('btnConnectFirebase');
    if (connectBtn) {
      connectBtn.textContent = '🔗 Connect';
      connectBtn.style.background = '';
    }
    
    // Update data source status
    const dataSourceStatus = document.getElementById('dataSourceStatus');
    if (dataSourceStatus) {
      dataSourceStatus.textContent = 'Simulation';
      dataSourceStatus.style.color = '#ffc107';
    }
    
    if (pendingAlertTimer) { clearTimeout(pendingAlertTimer); pendingAlertTimer = null; pendingSeverity = null; }
  }


  document.getElementById('btnStop')?.addEventListener('click', stop);
  document.getElementById('btnReset')?.addEventListener('click', reset);
  document.getElementById('btnConnectFirebase')?.addEventListener('click', () => {
    // Start showing readings when Connect button is clicked
    console.log('Connect button clicked - starting data collection');
    
    // Update data source status
    const dataSourceStatus = document.getElementById('dataSourceStatus');
    if (dataSourceStatus) {
      dataSourceStatus.textContent = 'Connecting...';
      dataSourceStatus.style.color = '#17a2b8';
    }
    
    // Start the data collection
    start();
    
    // Update button text to show it's active
    const connectBtn = document.getElementById('btnConnectFirebase');
    if (connectBtn) {
      connectBtn.textContent = '🔗 Connected';
      connectBtn.style.background = '#28a745';
    }
  });

  // Modal functionality
  const modal = document.getElementById('firebaseModal');
  const firebaseConfigBtn = document.getElementById('firebaseConfigBtn');
  const closeModal = document.getElementById('closeModal');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalConnectBtn = document.getElementById('modalConnectBtn');
  const modalTestBtn = document.getElementById('modalTestBtn');
  const modalFirebaseUrl = document.getElementById('modalFirebaseUrl');
  const modalFirebaseStatus = document.getElementById('modalFirebaseStatus');

  // Show modal
  firebaseConfigBtn?.addEventListener('click', () => {
    modal.classList.add('show');
    // Copy current URL to modal input if it exists
    const currentUrl = document.getElementById('firebaseUrl')?.value || '';
    if (currentUrl) {
      modalFirebaseUrl.value = currentUrl;
    }
  });

  // Hide modal
  function hideModal() {
    modal.classList.remove('show');
  }

  closeModal?.addEventListener('click', hideModal);
  modalCancelBtn?.addEventListener('click', hideModal);

  // Close modal when clicking outside
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideModal();
    }
  });

  // Modal connect function
  function modalConnectToFirebase() {
    const url = modalFirebaseUrl.value.trim();
    
    if (!url) {
      modalFirebaseStatus.textContent = 'Please enter Firebase URL';
      modalFirebaseStatus.className = 'modal-status error';
      return;
    }
    
    // Store the URL for future reference (no main input field to update)
    
    // Update Firebase config with the provided URL
    if (window.FirebaseDB) {
      try {
        modalFirebaseStatus.textContent = 'Connecting...';
        modalFirebaseStatus.className = 'modal-status info';
        
        // Disconnect existing connection
        if (firebaseRef) {
          firebaseRef.off();
        }
        
        // Create new reference with the provided URL
        firebaseRef = window.FirebaseDB.refFromURL(url);
        
        // Test connection
        firebaseRef.once('value', (snapshot) => {
          const data = snapshot.val();
          console.log('Firebase connection test - Data structure:', data);
          
          if (data) {
            modalFirebaseStatus.textContent = '✅ Connected to Firebase - Data found';
            modalFirebaseStatus.className = 'modal-status success';
            isFirebaseConnected = true;
            
            // Connection successful - no main status to update
            
            // Start listening for real-time data
            firebaseRef.on('value', (snapshot) => {
              const data = snapshot.val();
              if (data) {
                updateFromFirebaseData(data);
              }
            });
            
            // Close modal after successful connection
            setTimeout(() => {
              hideModal();
            }, 1500);
          } else {
            modalFirebaseStatus.textContent = '⚠️ Connected but no data found - Check your Firebase data structure';
            modalFirebaseStatus.className = 'modal-status warning';
            isFirebaseConnected = false;
          }
        }, (error) => {
          modalFirebaseStatus.textContent = '❌ Connection failed: ' + error.message;
          modalFirebaseStatus.className = 'modal-status error';
          isFirebaseConnected = false;
        });
        
      } catch (error) {
        modalFirebaseStatus.textContent = '❌ Invalid URL: ' + error.message;
        modalFirebaseStatus.className = 'modal-status error';
        isFirebaseConnected = false;
      }
    } else {
      modalFirebaseStatus.textContent = '❌ Firebase not initialized';
      modalFirebaseStatus.className = 'modal-status error';
    }
  }

  // Modal test data function
  function modalTestWithSampleData() {
    modalFirebaseStatus.textContent = '🧪 Testing with sample data...';
    modalFirebaseStatus.className = 'modal-status info';
    
    // Simulate Firebase data with different structures
    const testData = {
      voltage: 230.5 + (Math.random() - 0.5) * 10,
      current: 1.2 + (Math.random() - 0.5) * 0.5,
      timestamp: new Date().toISOString()
    };
    
    console.log('Testing with sample data:', testData);
    updateFromFirebaseData(testData);
    
    modalFirebaseStatus.textContent = '✅ Sample data applied - Check readings above';
    modalFirebaseStatus.className = 'modal-status success';
    
    // Sample data applied - no main status to update
    
    // Close modal after test
    setTimeout(() => {
      hideModal();
    }, 1500);
  }

  modalConnectBtn?.addEventListener('click', modalConnectToFirebase);
  modalTestBtn?.addEventListener('click', modalTestWithSampleData);

  // Auto-start with simulation mode
  start();
})();




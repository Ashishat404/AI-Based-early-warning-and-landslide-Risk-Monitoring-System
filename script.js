// ==========================================
// TAILWIND CONFIG
// ==========================================
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070b14',
          900: '#0d1527',
          850: '#111c35',
          800: '#172545',
          700: '#1e325c',
          600: '#2a437a'
        },
        hazard: {
          critical: '#ef4444',
          high: '#f97316',
          moderate: '#eab308',
          low: '#22c55e'
        }
      }
    }
  }
};

// ==========================================
// 1. DETERMINISTIC APPLICATION STATE & DATA
// ==========================================
const AppState = {
  activeTab: 'overview',
  selectedState: 'Sikkim',
  selectedDistrict: 'Pakyong',
  selectedHotspotId: 'pakyong_nh10',
  activeHazardLayer: 'landslide',
  forecastHourIndex: 1, // 0: 0h, 1: 12h, 2: 24h, 3: 48h, 4: 72h
  alertFilter: 'ACTIVE',
  searchQuery: '',

  // Hierarchical Taxonomy & Location Dataset
  locations: [
    {
      id: 'pakyong_nh10',
      state: 'Sikkim',
      district: 'Pakyong',
      name: 'Pakyong NH-10 Corridor',
      subText: 'NH-10 Highway Corridor (Mile 14 to 22)',
      hazardType: 'landslide',
      riskScore: 88,
      riskCategory: 'CRITICAL',
      rainfall: 142,
      soilSaturation: 92.4,
      slope: 42.5,
      insarDisplacement: '+18.4 mm/week',
      mapPos: { x: 42, y: 48 },
      aiSummary: 'Critical slope failure probability within 12h due to persistent extreme precipitation exceeding hydraulic dissipation capacity.',
      primaryDriver: 'Coupled Extreme Rainfall & Soil Liquefaction',
      forecastSeries: [82, 88, 85, 70, 52], // 0h, 12h, 24h, 48h, 72h
      forecastRainSeries: [18.2, 22.5, 14.1, 5.0, 2.1]
    },
    {
      id: 'gangtok_slopes',
      state: 'Sikkim',
      district: 'East Sikkim',
      name: 'Gangtok Urban Slopes',
      subText: 'Indira By-Pass Corridor',
      hazardType: 'landslide',
      riskScore: 64,
      riskCategory: 'MODERATE',
      rainfall: 88,
      soilSaturation: 74.2,
      slope: 38.0,
      insarDisplacement: '+6.2 mm/week',
      mapPos: { x: 55, y: 32 },
      aiSummary: 'Moderate slope creep observed. Secondary drainage clogging detected via optical satellites.',
      primaryDriver: 'Urban Surcharge & Clogged Drainage Channels',
      forecastSeries: [58, 64, 68, 55, 40],
      forecastRainSeries: [10.5, 12.0, 15.2, 4.0, 1.0]
    },
    {
      id: 'haflong_railway',
      state: 'Assam',
      district: 'Dima Hasao',
      name: 'Haflong Railway Cut',
      subText: 'Lumding-Badarpur Hill Section',
      hazardType: 'landslide',
      riskScore: 82,
      riskCategory: 'CRITICAL',
      rainfall: 165,
      soilSaturation: 89.1,
      slope: 45.0,
      insarDisplacement: '+14.8 mm/week',
      mapPos: { x: 75, y: 65 },
      aiSummary: 'High potential for rail-track displacement due to deep seated cutting failure.',
      primaryDriver: 'Extreme Hill-Section Downpour & Railway Cut Slope Surcharge',
      forecastSeries: [76, 82, 78, 62, 45],
      forecastRainSeries: [20.0, 25.1, 12.0, 3.5, 0.5]
    },
    {
      id: 'rangpo_river',
      state: 'Sikkim',
      district: 'Pakyong',
      name: 'Rangpo River Basin',
      subText: 'Lower Teesta Basin Junction',
      hazardType: 'flash_flood',
      riskScore: 78,
      riskCategory: 'HIGH',
      rainfall: 130,
      soilSaturation: 86.5,
      slope: 15.2,
      insarDisplacement: 'N/A (Hydrological)',
      mapPos: { x: 38, y: 62 },
      aiSummary: 'Rapid stage-level rise anticipated due to upper catchment runoff surge.',
      primaryDriver: 'Teesta Upper Catchment Glacial & Rainfall Inflow Surge',
      forecastSeries: [68, 78, 80, 60, 42],
      forecastRainSeries: [14.0, 18.5, 16.0, 6.0, 2.0]
    }
  ],

  // Centralized Alerts Dataset
  alerts: [
    {
      id: 'ALT-9021',
      locationId: 'pakyong_nh10',
      locationName: 'Pakyong NH-10 Corridor',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      hazard: 'Landslide Creep',
      timestamp: '13:45 IST',
      description: 'InSAR deformation exceeded 15mm/wk threshold.',
      recommendedAction: 'Suspend heavy traffic on NH-10 immediately.'
    },
    {
      id: 'ALT-9022',
      locationId: 'haflong_railway',
      locationName: 'Haflong Railway Cut',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      hazard: 'Slope Instability',
      timestamp: '12:30 IST',
      description: 'Soil saturation above 89% along track embankment.',
      recommendedAction: 'Issue slow-order advisory to NFR Railway control.'
    },
    {
      id: 'ALT-9023',
      locationId: 'rangpo_river',
      locationName: 'Rangpo River Basin',
      severity: 'HIGH',
      status: 'ACKNOWLEDGED',
      hazard: 'Flash Flood Stage-2',
      timestamp: '11:15 IST',
      description: 'Teesta water stage rising 0.45m/hr.',
      recommendedAction: 'Alert low-lying riverside settlements in Rangpo town.'
    },
    {
      id: 'ALT-9019',
      locationId: 'gangtok_slopes',
      locationName: 'Gangtok Urban Slopes',
      severity: 'MODERATE',
      status: 'RESOLVED',
      hazard: 'Drainage Overflow',
      timestamp: '08:00 IST',
      description: 'Clogged arterial drain cleared by municipal team.',
      recommendedAction: 'Routine monitoring maintained.'
    }
  ]
};

let forecastChartInstance = null;

// ==========================================
// 2. CORE HELPER FUNCTIONS & EXPLAINABLE AI
// ==========================================

function getSelectedHotspot() {
  return AppState.locations.find(l => l.id === AppState.selectedHotspotId) || AppState.locations[0];
}

// Mathematical Explainable AI Calculation
function calculateXaiContributions(loc) {
  // Model Weights: Rainfall 38%, Soil 28%, Slope 22%, InSAR 12%
  const rainContrib = ((loc.rainfall / 160) * 38).toFixed(1);
  const soilContrib = ((loc.soilSaturation / 100) * 28).toFixed(1);
  const slopeContrib = ((loc.slope / 50) * 22).toFixed(1);
  const insarContrib = ((loc.riskScore / 100) * 12).toFixed(1); // Derived deterministically

  return {
    rainContrib,
    soilContrib,
    slopeContrib,
    insarContrib,
    totalScore: Math.min(100, Math.round(parseFloat(rainContrib) + parseFloat(soilContrib) + parseFloat(slopeContrib) + parseFloat(insarContrib)))
  };
}

// Format IST Time strictly using Asia/Kolkata
function updateIstClock() {
  const clockEl = document.getElementById('istClock');
  if (!clockEl) return;
  const options = { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const formatter = new Intl.DateTimeFormat([], options);
  clockEl.textContent = formatter.format(new Date()) + ' IST';
}

// ==========================================
// 3. UI RENDER ENGINE & COMPONENT UPDATES
// ==========================================

function renderAll() {
  renderLocationSelectors();
  renderActiveTelemetryPanel();
  renderMapHotspots();
  renderExplainableAiPanel();
  renderForecastChart();
  renderAlertsTable();
  renderKpis();
}

function renderKpis() {
  const activeAlertsCount = AppState.alerts.filter(a => a.status === 'ACTIVE').length;
  document.getElementById('kpiHotspots').textContent = `${AppState.locations.length} Locations`;
  document.getElementById('kpiCritical').textContent = `${AppState.locations.filter(l => l.riskCategory === 'CRITICAL').length} Critical`;
  document.getElementById('navAlertBadge').textContent = activeAlertsCount;
}

function renderLocationSelectors() {
  const stateSelect = document.getElementById('stateSelect');
  const districtSelect = document.getElementById('districtSelect');
  const locationSelect = document.getElementById('locationSelect');

  // Unique States
  const states = [...new Set(AppState.locations.map(l => l.state))];
  stateSelect.innerHTML = states.map(s => `<option value="${s}" ${s === AppState.selectedState ? 'selected' : ''}>${s}</option>`).join('');

  // Filter Districts based on selected state
  const districts = [...new Set(AppState.locations.filter(l => l.state === AppState.selectedState).map(l => l.district))];
  districtSelect.innerHTML = districts.map(d => `<option value="${d}" ${d === AppState.selectedDistrict ? 'selected' : ''}>${d}</option>`).join('');

  // Filter Locations based on district
  const locs = AppState.locations.filter(l => l.state === AppState.selectedState && l.district === AppState.selectedDistrict);
  locationSelect.innerHTML = locs.map(l => `<option value="${l.id}" ${l.id === AppState.selectedHotspotId ? 'selected' : ''}>${l.name}</option>`).join('');
}

function renderActiveTelemetryPanel() {
  const loc = getSelectedHotspot();
  document.getElementById('panelLocationName').textContent = loc.name;
  document.getElementById('panelSubText').textContent = `${loc.district} District, ${loc.state}`;
  document.getElementById('panelRiskValue').textContent = loc.riskScore;
  document.getElementById('panelAiSummary').textContent = loc.aiSummary;

  document.getElementById('telRainfall').textContent = `${loc.rainfall} mm/24h`;
  document.getElementById('telSoil').textContent = `${loc.soilSaturation}%`;
  document.getElementById('telSlope').textContent = `${loc.slope}°`;
  document.getElementById('telInsar').textContent = loc.insarDisplacement;

  const badge = document.getElementById('headerRiskBadge');
  badge.textContent = `${loc.riskScore}/100 (${loc.riskCategory})`;

  const gauge = document.getElementById('panelRiskGauge');
  if (loc.riskScore >= 80) {
    gauge.className = "w-14 h-14 rounded-full border-4 border-rose-500 flex flex-col items-center justify-center bg-rose-500/10 text-rose-500";
    badge.className = "font-mono font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30";
  } else if (loc.riskScore >= 65) {
    gauge.className = "w-14 h-14 rounded-full border-4 border-amber-500 flex flex-col items-center justify-center bg-amber-500/10 text-amber-500";
    badge.className = "font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30";
  } else {
    gauge.className = "w-14 h-14 rounded-full border-4 border-yellow-500 flex flex-col items-center justify-center bg-yellow-500/10 text-yellow-500";
    badge.className = "font-mono font-bold px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
  }
}

function renderMapHotspots() {
  const container1 = document.getElementById('mapHotspotsOverlay');
  const container2 = document.getElementById('fullMapHotspotsOverlay');

  const filteredLocations = AppState.locations.filter(l => {
    if (AppState.activeHazardLayer === 'landslide') return l.hazardType === 'landslide';
    if (AppState.activeHazardLayer === 'flash_flood') return l.hazardType === 'flash_flood';
    return true;
  });

  const html = filteredLocations.map(loc => {
    const isSelected = loc.id === AppState.selectedHotspotId;
    const color = loc.riskScore >= 80 ? 'bg-rose-500' : (loc.riskScore >= 65 ? 'bg-amber-500' : 'bg-yellow-500');
    const border = isSelected ? 'ring-4 ring-blue-400 scale-125 z-20' : 'hover:scale-110 opacity-90';

    return `
      <div 
        onclick="selectHotspotById('${loc.id}')"
        class="absolute cursor-pointer transition-all duration-300 pointer-events-auto transform -translate-x-1/2 -translate-y-1/2" 
        style="left: ${loc.mapPos.x}%; top: ${loc.mapPos.y}%;"
        title="${loc.name} (${loc.riskCategory})"
      >
        <div class="relative flex items-center justify-center">
          ${isSelected ? `<span class="animate-ping absolute inline-flex h-8 w-8 rounded-full ${color} opacity-75"></span>` : ''}
          <div class="w-6 h-6 rounded-full ${color} text-white font-mono font-bold text-[10px] flex items-center justify-center shadow-lg border-2 border-navy-950 ${border}">
            ${loc.riskScore}
          </div>
        </div>
        <div class="bg-navy-900/90 border border-navy-700 px-2 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap mt-1 shadow-md">
          ${loc.name}
        </div>
      </div>
    `;
  }).join('');

  if (container1) container1.innerHTML = html;
  if (container2) container2.innerHTML = html;
}

// ==========================================
// 6. LIVE API CONNECTORS, MAP INIT & PWA
// ==========================================

let _leaflet = {
  map: null,
  markers: {}
};

function initLeafletMap() {
  if (typeof L === 'undefined') return; // Leaflet not loaded
  const el = document.getElementById('leafletMap');
  if (!el) return;

  // Base coords around Shillong
  const baseLat = 25.5788;
  const baseLng = 91.8933;

  _leaflet.map = L.map(el).setView([baseLat, baseLng], 9);

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(_leaflet.map);

  const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

  const gibs = L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg', {
    time: new Date().toISOString().slice(0,10),
    pane: 'overlay'
  });

  const baseMaps = { 'OpenStreetMap': osm, 'Esri Satellite': esriSat };
  const overlayMaps = { 'NASA GIBS TrueColor': gibs };
  L.control.layers(baseMaps, overlayMaps, { collapsed: true }).addTo(_leaflet.map);

  // add markers for current locations
  updateMapMarkers();
}

function updateMapMarkers() {
  if (!_leaflet.map) return;
  const baseLat = 25.5788;
  const baseLng = 91.8933;

  AppState.locations.forEach(loc => {
    const lat = baseLat + ((loc.mapPos.y - 50) / 500);
    const lng = baseLng + ((loc.mapPos.x - 50) / 500);

    if (_leaflet.markers[loc.id]) {
      _leaflet.markers[loc.id].setLatLng([lat, lng]);
      _leaflet.markers[loc.id].setPopupContent(`<strong>${loc.name}</strong><br/>Risk: ${loc.riskScore}/100<br/>Rain: ${loc.rainfall} mm<br/>Soil: ${loc.soilSaturation}%`);
      return;
    }

    const color = loc.riskScore >= 80 ? 'red' : (loc.riskScore >= 65 ? 'orange' : 'yellow');
    const marker = L.circleMarker([lat, lng], { radius: 8, color: color, fillColor: color, fillOpacity: 0.9 }).addTo(_leaflet.map);
    marker.bindPopup(`<strong>${loc.name}</strong><br/>Risk: ${loc.riskScore}/100<br/>Rain: ${loc.rainfall} mm<br/>Soil: ${loc.soilSaturation}%`);
    marker.on('click', () => selectHotspotById(loc.id));
    _leaflet.markers[loc.id] = marker;
  });
}

async function fetchWeatherData() {
  const cfg = window.AppConfig || {};
  const url = cfg.imdWeatherEndpoint || 'https://api.open-meteo.com/v1/forecast?latitude=25.5788&longitude=91.8933&current=precipitation&hourly=precipitation_probability&forecast_days=1';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather fetch failed');
    const data = await res.json();

    // Normalize into districts array if possible
    // We use current.precipitation as mm value for demo
    const precip = (data.current && data.current.precipitation) ? parseFloat(data.current.precipitation) : null;
    AppState.locations.forEach(l => {
      if (precip !== null) l.rainfall = Math.round(precip * 10) / 10; // keep mm
    });
    return true;
  } catch (e) {
    console.warn('Weather fetch error', e);
    return false;
  }
}

async function fetchSensorData() {
  const cfg = window.AppConfig || {};
  const url = cfg.sensorEndpoint || 'https://api.thingspeak.com/channels/9/feeds.json?results=2';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Sensor fetch failed');
    const data = await res.json();

    // Map simple feeds to soil moisture for demonstration
    const latest = (data.feeds && data.feeds.length) ? data.feeds[data.feeds.length - 1] : null;
    const value = latest && (latest.field1 || latest.field2) ? Number(latest.field1 || latest.field2) : null;
    if (value !== null && !isNaN(value)) {
      AppState.locations.forEach(l => {
        l.soilSaturation = Math.min(100, Math.round(value));
      });
    }
    return true;
  } catch (e) {
    console.warn('Sensor fetch error', e);
    return false;
  }
}

async function fetchRiskData() {
  const cfg = window.AppConfig || {};
  const url = cfg.riskEngineEndpoint || '';
  if (!url) {
    // No external risk engine - compute lightweight proxy
    AppState.locations.forEach(l => {
      const score = Math.round(Math.min(100, (l.rainfall / 160) * 38 + (l.soilSaturation / 100) * 28 + (l.slope / 50) * 22 + (l.riskScore / 100) * 12));
      l.riskScore = score;
      l.riskCategory = score >= 80 ? 'CRITICAL' : (score >= 65 ? 'HIGH' : (score >= 40 ? 'MODERATE' : 'LOW'));
    });
    return true;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Risk fetch failed');
    const data = await res.json();
    // Expect data.districts[] -> map to locations by district
    if (data && data.districts) {
      AppState.locations.forEach(l => {
        const entry = data.districts.find(d => d.district === l.district);
        if (entry) {
          l.riskScore = entry.riskSeverity || l.riskScore;
          l.roadStatus = entry.roadStatus || l.roadStatus;
        }
      });
    }
    return true;
  } catch (e) {
    console.warn('Risk fetch error', e);
    return false;
  }
}

async function fetchAllLiveData() {
  const weatherOk = await fetchWeatherData();
  const sensorOk = await fetchSensorData();
  const riskOk = await fetchRiskData();

  // Update UI and map
  renderAll();
  updateMapMarkers();

  // trigger SMS for critical alerts
  AppState.alerts.forEach(a => { if (a.severity === 'CRITICAL' && a.status === 'ACTIVE') sendSmsAlert(a); });

  return { weatherOk, sensorOk, riskOk };
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      console.log('ServiceWorker registered', reg.scope);
    }).catch(err => console.warn('SW registration failed', err));
  }
}

// Offline report queueing
function queueOfflineReport(report) {
  const key = 'pravaha_offline_queue';
  const q = JSON.parse(localStorage.getItem(key) || '[]');
  q.push(report);
  localStorage.setItem(key, JSON.stringify(q));
}

async function flushOfflineQueue() {
  const key = 'pravaha_offline_queue';
  const q = JSON.parse(localStorage.getItem(key) || '[]');
  if (!q.length) return;
  const cfg = window.AppConfig || {};
  const url = cfg.reportIngestEndpoint;
  if (!url) return;
  while (q.length) {
    const item = q.shift();
    try {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
    } catch (e) {
      console.warn('Flush report failed, re-queueing', e);
      q.unshift(item);
      break;
    }
  }
  localStorage.setItem(key, JSON.stringify(q));
}

async function sendSmsAlert(alert) {
  const cfg = window.AppConfig || {};
  const url = cfg.smsAlertEndpoint;
  if (!url) return;
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alertId: alert.id, text: `${alert.severity}: ${alert.description}`, target: alert.locationName }) });
  } catch (e) {
    console.warn('SMS alert failed, queueing for background sync', e);
    queueOfflineReport({ type: 'sms', alert });
  }
}

function renderExplainableAiPanel() {
  const loc = getSelectedHotspot();
  const xai = calculateXaiContributions(loc);

  document.getElementById('xaiRainContribution').textContent = `Contrib: +${xai.rainContrib} pts`;
  document.getElementById('xaiSoilContribution').textContent = `Contrib: +${xai.soilContrib} pts`;
  document.getElementById('xaiSlopeContribution').textContent = `Contrib: +${xai.slopeContrib} pts`;
  document.getElementById('xaiInsarContribution').textContent = `Contrib: +${xai.insarContrib} pts`;

  document.getElementById('xaiRainBar').style.width = `${Math.min(100, (loc.rainfall / 160) * 100)}%`;
  document.getElementById('xaiSoilBar').style.width = `${loc.soilSaturation}%`;
  document.getElementById('xaiSlopeBar').style.width = `${(loc.slope / 50) * 100}%`;
  document.getElementById('xaiInsarBar').style.width = `${loc.riskScore}%`;

  document.getElementById('xaiScoreBox').textContent = `Score: ${loc.riskScore}/100`;
  document.getElementById('xaiPrimaryDriver').textContent = loc.primaryDriver;

  document.getElementById('xaiReasoningP1').textContent = `The target location (${loc.name}) exhibits extreme physical stress. Measured 24h precipitation is ${loc.rainfall}mm alongside a slope steepness of ${loc.slope}°.`;
  document.getElementById('xaiReasoningP2').textContent = `Soil pore water saturation level of ${loc.soilSaturation}% significantly degrades shear stability. InSAR satellite telemetry confirms ${loc.insarDisplacement} structural displacement.`;
  document.getElementById('xaiActionRec').textContent = loc.riskScore >= 80
    ? "Suspend transit corridors immediately. Issue tier-1 CAP emergency cell broadcast."
    : "Deploy mobile ground inspection teams and monitor telemetry every 15 minutes.";
}

function renderForecastChart() {
  const loc = getSelectedHotspot();
  const ctx = document.getElementById('forecastChart');
  if (!ctx) return;

  const labels = ['0h (Current)', '+12h Peak', '+24h Forecast', '+48h Forecast', '+72h Recovery'];

  if (forecastChartInstance) {
    forecastChartInstance.destroy();
  }

  forecastChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Projected Risk Score (0-100)',
          data: loc.forecastSeries,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointRadius: 6,
          pointHoverRadius: 8
        },
        {
          label: 'Hourly Precipitation Intensity (mm/hr)',
          data: loc.forecastRainSeries,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.1)',
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
          tension: 0.3,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 11 } } }
      },
      scales: {
        x: { grid: { color: '#172545' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
        y: { grid: { color: '#172545' }, ticks: { color: '#94a3b8', font: { size: 11 } }, min: 0, max: 100 }
      }
    }
  });

  // Update forecast detail cards based on slider index
  const idx = AppState.forecastHourIndex;
  const currentRisk = loc.forecastSeries[idx];
  const currentRain = loc.forecastRainSeries[idx];

  document.getElementById('forecastHorizonLabel').textContent = labels[idx];
  document.getElementById('forecastPeakRisk').textContent = `${currentRisk} / 100`;
  document.getElementById('forecastRainRate').textContent = `${currentRain} mm/hr`;
  document.getElementById('forecastAdvisory').textContent = currentRisk >= 80 ? 'Stage-3 Evacuation Ready' : (currentRisk >= 65 ? 'Stage-2 Advisory Watch' : 'Stage-1 Routine Observation');
}

function renderAlertsTable() {
  const tbody = document.getElementById('alertsTableBody');
  if (!tbody) return;

  const filtered = AppState.alerts.filter(a => {
    if (AppState.alertFilter === 'ALL') return true;
    return a.status === AppState.alertFilter;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-500 italic">No alerts match the selected status filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const sevColor = a.severity === 'CRITICAL' ? 'text-rose-400 bg-rose-500/10 border-rose-500/30' : (a.severity === 'HIGH' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30');
    const statusColor = a.status === 'ACTIVE' ? 'text-rose-400 font-bold' : (a.status === 'ACKNOWLEDGED' ? 'text-amber-400' : 'text-emerald-400');

    return `
      <tr class="hover:bg-navy-900/50 transition-colors">
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded border text-[10px] font-bold ${sevColor}">${a.severity}</span>
        </td>
        <td class="py-3 px-3 font-semibold text-white">${a.locationName}</td>
        <td class="py-3 px-3 text-slate-300">${a.hazard}</td>
        <td class="py-3 px-3 font-mono text-slate-400 text-[11px]">${a.timestamp}</td>
        <td class="py-3 px-3 ${statusColor}">${a.status}</td>
        <td class="py-3 px-3 text-right">
          <button onclick="selectAlertForCap('${a.id}')" class="bg-navy-800 hover:bg-blue-600 text-slate-200 hover:text-white px-2.5 py-1 rounded text-[11px] font-semibold transition-all border border-navy-700">
            Select for CAP
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Update CAP Target location text
  const targetLoc = getSelectedHotspot();
  document.getElementById('capTargetLocation').textContent = targetLoc.name;
}

// ==========================================
// 4. INTERACTION & EVENT HANDLERS
// ==========================================

function selectHotspotById(id) {
  const loc = AppState.locations.find(l => l.id === id);
  if (!loc) return;

  AppState.selectedHotspotId = loc.id;
  AppState.selectedState = loc.state;
  AppState.selectedDistrict = loc.district;

  renderAll();
}

function switchTab(tabId) {
  AppState.activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.className = "tab-btn active px-4 py-3 border-b-2 border-blue-500 text-blue-400 flex items-center gap-2 shrink-0 transition-all font-semibold";
    } else {
      btn.className = "tab-btn px-4 py-3 border-b-2 border-transparent hover:text-slate-200 text-slate-400 flex items-center gap-2 shrink-0 transition-all font-semibold";
    }
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    if (content.id === `tab-${tabId}`) {
      content.classList.remove('hidden');
    } else {
      content.classList.add('hidden');
    }
  });

  if (tabId === 'forecast') {
    setTimeout(renderForecastChart, 50);
  }
}

function selectAlertForCap(alertId) {
  const alert = AppState.alerts.find(a => a.id === alertId);
  if (!alert) return;

  selectHotspotById(alert.locationId);
  switchTab('alerts');

  const log = document.getElementById('capLogContainer');
  log.innerHTML += `<div class="text-cyan-400">[SELECTED] Alert ${alert.id} loaded into CAP Dispatcher. Target: ${alert.locationName}</div>`;
  log.scrollTop = log.scrollHeight;
}

function executeCapBroadcast() {
  const loc = getSelectedHotspot();
  const log = document.getElementById('capLogContainer');

  document.getElementById('capStep3').className = "flex items-center gap-2 text-emerald-400";

  log.innerHTML += `<div class="text-amber-400">[APPROVAL] SDMA Officer authorized CAP XML payload.</div>`;

  setTimeout(() => {
    document.getElementById('capStep4').className = "flex items-center gap-2 text-emerald-400";
    log.innerHTML += `<div class="text-emerald-400 font-bold">[BROADCAST SUCCESS] Cell broadcast transmitted to region: ${loc.name}. SMS queued to 45,200 recipients.</div>`;
    log.scrollTop = log.scrollHeight;
    document.getElementById('kpiCapStatus').textContent = "CAP Sent (Active)";
  }, 800);
}

function performGisSearch(query) {
  if (!query) return;
  const q = query.toLowerCase().trim();
  const match = AppState.locations.find(l =>
    l.name.toLowerCase().includes(q) ||
    l.district.toLowerCase().includes(q) ||
    l.state.toLowerCase().includes(q) ||
    l.subText.toLowerCase().includes(q)
  );

  if (match) {
    selectHotspotById(match.id);
    alert(`GIS Target Found: Centered on ${match.name}`);
  } else {
    alert(`No spatial match found for "${query}". Try searching "NH-10", "Pakyong", "Haflong", or "Gangtok".`);
  }
}

// ==========================================
// 5. INITIALIZATION & EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // Start IST Clock
  updateIstClock();
  setInterval(updateIstClock, 1000);

  // Render Initial State
  renderAll();
  // Initialize Leaflet map and service worker
  initLeafletMap();
  registerServiceWorker();

  // Fetch live data once and then periodically
  fetchAllLiveData();
  setInterval(fetchAllLiveData, 120000); // every 2 minutes

  // Flush offline queue when online
  window.addEventListener('online', () => flushOfflineQueue());

  // Tab Buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Quick Deep Analyze Button
  document.getElementById('deepAnalyzeBtn').addEventListener('click', () => switchTab('deep-analysis'));
  document.getElementById('gotoRiskAnalysisBtn').addEventListener('click', () => switchTab('deep-analysis'));

  // Location Hierarchy Selectors
  document.getElementById('stateSelect').addEventListener('change', (e) => {
    AppState.selectedState = e.target.value;
    const firstDist = AppState.locations.find(l => l.state === AppState.selectedState).district;
    AppState.selectedDistrict = firstDist;
    const firstLoc = AppState.locations.find(l => l.state === AppState.selectedState && l.district === AppState.selectedDistrict);
    AppState.selectedHotspotId = firstLoc.id;
    renderAll();
  });

  document.getElementById('districtSelect').addEventListener('change', (e) => {
    AppState.selectedDistrict = e.target.value;
    const firstLoc = AppState.locations.find(l => l.state === AppState.selectedState && l.district === AppState.selectedDistrict);
    AppState.selectedHotspotId = firstLoc.id;
    renderAll();
  });

  document.getElementById('locationSelect').addEventListener('change', (e) => {
    selectHotspotById(e.target.value);
  });

  // Hazard Layer Toggles
  document.querySelectorAll('.hazard-layer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.hazard-layer-btn').forEach(b => {
        b.className = "hazard-layer-btn px-2.5 py-1 rounded font-semibold text-slate-400 hover:text-white transition-all";
      });
      btn.className = "hazard-layer-btn active px-2.5 py-1 rounded font-semibold text-blue-400 bg-navy-800 transition-all";
      AppState.activeHazardLayer = btn.dataset.hazard;
      renderMapHotspots();
    });
  });

  // Forecast Slider
  document.getElementById('forecastSlider').addEventListener('input', (e) => {
    AppState.forecastHourIndex = parseInt(e.target.value);
    renderForecastChart();
  });

  // Alert Filter
  document.getElementById('alertFilterSelect').addEventListener('change', (e) => {
    AppState.alertFilter = e.target.value;
    renderAlertsTable();
  });

  // CAP Broadcast Trigger
  document.getElementById('capBroadcastBtn').addEventListener('click', executeCapBroadcast);

  // GIS Search Buttons
  document.getElementById('gisSearchBtn').addEventListener('click', () => {
    performGisSearch(document.getElementById('gisSearchInput').value);
  });
  document.getElementById('gisSearchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performGisSearch(e.target.value);
  });
  document.getElementById('fullGisSearch').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performGisSearch(e.target.value);
  });
});
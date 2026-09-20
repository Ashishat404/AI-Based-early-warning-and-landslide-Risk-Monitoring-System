// /* =========================================================
//    PRAVAHA - ML LANDSLIDE DASHBOARD INTEGRATION
//    Flask API:
//      http://127.0.0.1:5000/api/dashboard
//      http://127.0.0.1:5000/api/zones
//      http://127.0.0.1:5000/api/predictions

//    This version:
//    - Uses the ML prediction API
//    - Does NOT require /api/alerts
//    - Derives alerts from prediction data
//    - Prevents Chart.js canvas reuse errors
//    - Does not show chart errors as API connection errors
//    - Safely handles missing HTML elements
//    ========================================================= */

// "use strict";

// /* =========================================================
//    CONFIGURATION
//    ========================================================= */

// const LANDSLIDE_API = "http://127.0.0.1:5000/api";

// const REFRESH_INTERVAL = 60 * 1000; // 60 seconds

// let pravahaPredictions = [];
// let pravahaDashboard = null;
// let pravahaZones = [];
// let pravahaAlerts = [];
// let pravahaActive = null;

// let pravahaRiskChart = null;

// /* =========================================================
//    BASIC HELPERS
//    ========================================================= */

// function setText(id, value) {
//     const el = document.getElementById(id);

//     if (el) {
//         el.textContent = value ?? "";
//     }
// }

// function getElement(id) {
//     return document.getElementById(id);
// }

// function escapeHtml(value) {
//     return String(value ?? "").replace(
//         /[&<>"']/g,
//         function (character) {
//             const map = {
//                 "&": "&amp;",
//                 "<": "&lt;",
//                 ">": "&gt;",
//                 '"': "&quot;",
//                 "'": "&#039;"
//             };

//             return map[character];
//         }
//     );
// }

// function numeric(value, fallback = 0) {
//     const number = Number(value);

//     return Number.isFinite(number) ? number : fallback;
// }

// function percent(value) {
//     return numeric(value * 100, 0);
// }

// /* =========================================================
//    API STATUS
//    ========================================================= */

// function updateApiStatus(isConnected, message) {
//     const el = getElement("apiStatus");

//     if (!el) {
//         console.log(
//             isConnected
//                 ? `API connected: ${message}`
//                 : `API error: ${message}`
//         );

//         return;
//     }

//     if (isConnected) {
//         el.className =
//             "mb-6 p-4 rounded-lg bg-green-100 text-green-800 border border-green-200";

//         el.innerHTML = `
//             <div class="flex items-center gap-2">
//                 <span class="text-base">🟢</span>
//                 <span>${escapeHtml(message)}</span>
//             </div>
//         `;
//     } else {
//         el.className =
//             "mb-6 p-4 rounded-lg bg-red-100 text-red-800 border border-red-200";

//         el.innerHTML = `
//             <div class="flex items-center gap-2">
//                 <span class="text-base">🔴</span>
//                 <span>${escapeHtml(message)}</span>
//             </div>
//         `;
//     }
// }

// /* =========================================================
//    API REQUEST
//    ========================================================= */

// async function fetchJson(endpoint) {
//     const url = `${LANDSLIDE_API}${endpoint}`;

//     const response = await fetch(url, {
//         method: "GET",
//         headers: {
//             Accept: "application/json"
//         },
//         cache: "no-store"
//     });

//     if (!response.ok) {
//         throw new Error(
//             `${endpoint} returned HTTP ${response.status}`
//         );
//     }

//     const data = await response.json();

//     return data;
// }

// /* =========================================================
//    NORMALIZE PREDICTION
//    ========================================================= */

// function normalizePrediction(row, index) {
//     const confidenceRaw = numeric(
//         row.confidence ??
//         row.Confidence ??
//         row.prediction_confidence,
//         0
//     );

//     /*
//      * Your CSV confidence is normally 0-1.
//      * The API may already return 0-100.
//      */
//     let confidence = confidenceRaw;

//     if (confidence >= 0 && confidence <= 1) {
//         confidence = confidence * 100;
//     }

//     const predictedMaterial =
//         row.predictedMaterial ??
//         row.Predicted_Material ??
//         row.predicted_material ??
//         "Unknown";

//     const movement =
//         row.movement ??
//         row.Movement_Class ??
//         row.movement_class ??
//         "Unknown";

//     const state =
//         row.state ??
//         row.State ??
//         "Unknown";

//     const district =
//         row.district ??
//         row.District ??
//         "Unknown";

//     const lat = numeric(
//         row.lat ??
//         row.latitude ??
//         row.Latitude,
//         NaN
//     );

//     const lon = numeric(
//         row.lon ??
//         row.longitude ??
//         row.Longitude,
//         NaN
//     );

//     const highwayValue =
//         row.isHighway ??
//         row.Is_Highway ??
//         row.is_highway ??
//         0;

//     const isHighway =
//         highwayValue === true ||
//         highwayValue === 1 ||
//         highwayValue === "1" ||
//         String(highwayValue).toLowerCase() === "true";

//     /*
//      * Prefer API-provided risk values when available.
//      */
//     let riskScore = numeric(
//         row.riskScore ??
//         row.risk_score,
//         NaN
//     );

//     let riskLevel =
//         row.riskLevel ??
//         row.risk_level ??
//         row.alert ??
//         "";

//     /*
//      * If API did not provide an operational risk score,
//      * derive one from ML confidence + movement + highway flag.
//      */
//     if (!Number.isFinite(riskScore)) {
//         riskScore = calculateRiskScore({
//             confidence,
//             predictedMaterial,
//             movement,
//             isHighway
//         });
//     }

//     if (!riskLevel) {
//         riskLevel = riskLevelFromScore(riskScore);
//     }

//     return {
//         id:
//             row.id ??
//             row.Slide_No ??
//             row.slide_no ??
//             `prediction-${index + 1}`,

//         slideNo:
//             row.slideNo ??
//             row.Slide_No ??
//             row.slide_no ??
//             `prediction-${index + 1}`,

//         state,
//         district,

//         lat,
//         lon,

//         actualMaterial:
//             row.actualMaterial ??
//             row.Actual_Material ??
//             row.actual_material ??
//             "Unknown",

//         predictedMaterial,

//         confidence,

//         movement,

//         isHighway,

//         riskScore,

//         riskLevel
//     };
// }

// /* =========================================================
//    RISK SCORE
//    ========================================================= */

// function calculateRiskScore(p) {
//     let score = numeric(p.confidence, 0);

//     /*
//      * Confidence is the primary ML signal.
//      */

//     const movement = String(
//         p.movement || ""
//     ).toLowerCase();

//     /*
//      * Movement modifiers.
//      */
//     if (movement === "slide") {
//         score += 3;
//     } else if (movement === "flow") {
//         score += 7;
//     } else if (movement === "fall") {
//         score += 5;
//     } else if (movement === "subsidence") {
//         score += 4;
//     }

//     /*
//      * Highway exposure is used as an operational
//      * priority modifier.
//      */
//     if (p.isHighway) {
//         score += 5;
//     }

//     /*
//      * Predicted material modifier.
//      */
//     const material = String(
//         p.predictedMaterial || ""
//     ).toLowerCase();

//     if (material === "debris") {
//         score += 2;
//     } else if (material === "rock") {
//         score += 1;
//     }

//     return Math.max(
//         0,
//         Math.min(100, score)
//     );
// }

// function riskLevelFromScore(score) {
//     const value = numeric(score, 0);

//     if (value >= 80) {
//         return "CRITICAL";
//     }

//     if (value >= 65) {
//         return "HIGH";
//     }

//     if (value >= 45) {
//         return "MODERATE";
//     }

//     return "LOW";
// }

// /* =========================================================
//    ALERT STYLE
//    ========================================================= */

// function alertStyle(level) {
//     const value = String(
//         level || "LOW"
//     ).toUpperCase();

//     if (value === "CRITICAL") {
//         return {
//             text: "CRITICAL",
//             badge:
//                 "bg-red-100 text-red-800 border-red-300",
//             dot: "bg-red-600",
//             border: "border-l-red-600"
//         };
//     }

//     if (value === "HIGH") {
//         return {
//             text: "HIGH",
//             badge:
//                 "bg-orange-100 text-orange-800 border-orange-300",
//             dot: "bg-orange-500",
//             border: "border-l-orange-500"
//         };
//     }

//     if (value === "MODERATE") {
//         return {
//             text: "MODERATE",
//             badge:
//                 "bg-yellow-100 text-yellow-800 border-yellow-300",
//             dot: "bg-yellow-500",
//             border: "border-l-yellow-500"
//         };
//     }

//     return {
//         text: "LOW",
//         badge:
//             "bg-emerald-100 text-emerald-800 border-emerald-300",
//         dot: "bg-emerald-500",
//         border: "border-l-emerald-500"
//     };
// }

// /* =========================================================
//    LOAD ALL ML DATA
//    ========================================================= */

// async function loadPravahaML() {
//     /*
//      * IMPORTANT:
//      * Dashboard + predictions + zones only.
//      *
//      * We intentionally do NOT call /api/alerts because
//      * the Flask API version supplied earlier does not
//      * need that endpoint.
//      */

//     try {
//         const results = await Promise.allSettled([
//             fetchJson("/dashboard"),
//             fetchJson("/predictions?limit=2000"),
//             fetchJson("/zones")
//         ]);

//         const dashboardResult = results[0];
//         const predictionsResult = results[1];
//         const zonesResult = results[2];

//         if (
//             dashboardResult.status === "rejected" &&
//             predictionsResult.status === "rejected" &&
//             zonesResult.status === "rejected"
//         ) {
//             throw new Error(
//                 "Flask API is not reachable"
//             );
//         }

//         if (
//             dashboardResult.status === "fulfilled"
//         ) {
//             pravahaDashboard =
//                 dashboardResult.value;
//         }

//         if (
//             predictionsResult.status === "fulfilled"
//         ) {
//             const rawPredictions =
//                 predictionsResult.value.predictions ||
//                 predictionsResult.value.data ||
//                 [];

//             pravahaPredictions =
//                 rawPredictions.map(
//                     normalizePrediction
//                 );
//         }

//         if (
//             zonesResult.status === "fulfilled"
//         ) {
//             pravahaZones =
//                 zonesResult.value.zones ||
//                 zonesResult.value.data ||
//                 [];
//         }

//         /*
//          * Build alert list locally.
//          */
//         pravahaAlerts =
//             createAlertsFromPredictions(
//                 pravahaPredictions
//             );

//         pravahaActive =
//             findHighestRiskPrediction(
//                 pravahaPredictions
//             );

//         /*
//          * API connection succeeded.
//          */
//         updateApiStatus(
//             true,
//             `Connected to Smart Landslide Alert API · ${pravahaPredictions.length.toLocaleString()} ML predictions loaded`
//         );

//         /*
//          * Render sections separately.
//          *
//          * If one UI component fails, it will NOT
//          * incorrectly report the API as disconnected.
//          */
//         renderSafely(
//             "dashboard cards",
//             updateDashboardCards
//         );

//         renderSafely(
//             "selected prediction",
//             () =>
//                 renderSelectedPrediction(
//                     pravahaActive
//                 )
//         );

//         renderSafely(
//             "dashboard map",
//             renderDashboardMapLive
//         );

//         renderSafely(
//             "mini alerts",
//             renderMiniAlertsLive
//         );

//         renderSafely(
//             "dashboard table",
//             renderDashboardTableLive
//         );

//         renderSafely(
//             "alerts",
//             () => renderAlertsLive("ALL")
//         );

//         renderSafely(
//             "zones",
//             renderZonesLive
//         );

//         renderSafely(
//             "vulnerable table",
//             renderVulnerableTableLive
//         );

//         renderSafely(
//             "analysis selectors",
//             () =>
//                 updateAnalysisSelectorsLive()
//         );

//         renderSafely(
//             "analysis data",
//             () =>
//                 updateAnalysisDataLive()
//         );

//         renderSafely(
//             "trend chart",
//             updateTrendChartLive
//         );

//         /*
//          * Re-create icons if available.
//          */
//         if (
//             window.lucide &&
//             typeof window.lucide.createIcons ===
//                 "function"
//         ) {
//             window.lucide.createIcons();
//         }

//     } catch (error) {
//         console.error(
//             "PRAVAHA API LOAD ERROR:",
//             error
//         );

//         updateApiStatus(
//             false,
//             `Unable to connect to landslide API: ${error.message}`
//         );
//     }
// }

// /* =========================================================
//    SAFE RENDER
//    ========================================================= */

// function renderSafely(name, callback) {
//     try {
//         callback();
//     } catch (error) {
//         console.error(
//             `PRAVAHA ${name} render error:`,
//             error
//         );
//     }
// }

// /* =========================================================
//    CREATE ALERTS FROM ML PREDICTIONS
//    ========================================================= */

// function createAlertsFromPredictions(
//     predictions
// ) {
//     return predictions
//         .filter(
//             (p) =>
//                 numeric(p.riskScore, 0) >= 45
//         )
//         .sort(
//             (a, b) =>
//                 numeric(b.riskScore, 0) -
//                 numeric(a.riskScore, 0)
//         )
//         .slice(0, 100)
//         .map((p) => {
//             const movement =
//                 String(
//                     p.movement || "Unknown"
//                 );

//             return {
//                 id: p.id,

//                 location:
//                     `${p.district}, ${p.state}`,

//                 severity: p.riskLevel,

//                 hazard:
//                     `${p.predictedMaterial} ${movement}`,

//                 desc:
//                     `ML confidence ${numeric(
//                         p.confidence
//                     ).toFixed(2)}% at the predicted location.`,

//                 action:
//                     p.isHighway
//                         ? "Prioritize highway corridor inspection."
//                         : "Review the prediction with field observations.",

//                 confidence:
//                     p.confidence,

//                 score:
//                     p.riskScore,

//                 state:
//                     p.state,

//                 district:
//                     p.district,

//                 lat:
//                     p.lat,

//                 lon:
//                     p.lon
//             };
//         });
// }

// /* =========================================================
//    FIND HIGHEST RISK
//    ========================================================= */

// function findHighestRiskPrediction(
//     predictions
// ) {
//     if (
//         !predictions ||
//         !predictions.length
//     ) {
//         return null;
//     }

//     return predictions
//         .slice()
//         .sort(
//             (a, b) =>
//                 numeric(b.riskScore, 0) -
//                 numeric(a.riskScore, 0)
//         )[0];
// }

// /* =========================================================
//    DASHBOARD CARDS
//    ========================================================= */

// function updateDashboardCards() {
//     if (!pravahaDashboard) {
//         return;
//     }

//     let overallScore = numeric(
//         pravahaDashboard.overall_risk_score ??
//         pravahaDashboard.risk_score,
//         NaN
//     );

//     /*
//      * If Flask doesn't return overall risk,
//      * calculate it from prediction data.
//      */
//     if (!Number.isFinite(overallScore)) {
//         if (pravahaPredictions.length) {
//             overallScore =
//                 pravahaPredictions.reduce(
//                     (sum, p) =>
//                         sum +
//                         numeric(
//                             p.riskScore,
//                             0
//                         ),
//                     0
//                 ) /
//                 pravahaPredictions.length;
//         } else {
//             overallScore = 0;
//         }
//     }

//     const overallLevel =
//         riskLevelFromScore(
//             overallScore
//         );

//     setText(
//         "liveRegionalRiskScore",
//         overallScore.toFixed(1)
//     );

//     setText(
//         "liveRegionalRiskLevel",
//         overallLevel
//     );

//     setText(
//         "liveTotalPredictions",
//         numeric(
//             pravahaDashboard.total_predictions ??
//             pravahaPredictions.length
//         ).toLocaleString()
//     );

//     const criticalZones =
//         pravahaZones.filter(
//             (z) =>
//                 String(
//                     z.alert || ""
//                 ).toUpperCase() ===
//                 "CRITICAL"
//         ).length;

//     const highZones =
//         pravahaZones.filter(
//             (z) =>
//                 String(
//                     z.alert || ""
//                 ).toUpperCase() ===
//                 "HIGH"
//         ).length;

//     setText(
//         "liveCriticalZones",
//         numeric(
//             pravahaDashboard.critical_zones,
//             criticalZones
//         ).toLocaleString()
//     );

//     setText(
//         "liveHighZones",
//         numeric(
//             pravahaDashboard.high_zones,
//             highZones
//         ).toLocaleString()
//     );

//     setText(
//         "liveCorridorsAtRisk",
//         pravahaPredictions.filter(
//             (p) =>
//                 p.isHighway &&
//                 numeric(
//                     p.riskScore,
//                     0
//                 ) >= 65
//         ).length
//     );

//     setText(
//         "liveHighwayPredictions",
//         pravahaPredictions.filter(
//             (p) => p.isHighway
//         ).length.toLocaleString()
//     );

//     setText(
//         "liveAlertCount",
//         pravahaAlerts.length
//     );

//     setText(
//         "liveCriticalAlertCount",
//         pravahaAlerts.filter(
//             (a) =>
//                 a.severity ===
//                 "CRITICAL"
//         ).length
//     );

//     setText(
//         "liveHighAlertCount",
//         pravahaAlerts.filter(
//             (a) =>
//                 a.severity === "HIGH"
//         ).length
//     );
// }

// /* =========================================================
//    MAP
//    ========================================================= */

// function renderDashboardMapLive() {
//     const container =
//         getElement(
//             "mapHotspotsContainer"
//         );

//     if (!container) {
//         return;
//     }

//     container.innerHTML = "";

//     const validPredictions =
//         pravahaPredictions.filter(
//             (p) =>
//                 Number.isFinite(
//                     numeric(p.lat, NaN)
//                 ) &&
//                 Number.isFinite(
//                     numeric(p.lon, NaN)
//                 )
//         );

//     if (!validPredictions.length) {
//         container.innerHTML = `
//             <div class="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
//                 No ML prediction coordinates available.
//             </div>
//         `;

//         return;
//     }

//     const latitudes =
//         validPredictions.map(
//             (p) => numeric(p.lat)
//         );

//     const longitudes =
//         validPredictions.map(
//             (p) => numeric(p.lon)
//         );

//     const minLat =
//         Math.min(...latitudes);

//     const maxLat =
//         Math.max(...latitudes);

//     const minLon =
//         Math.min(...longitudes);

//     const maxLon =
//         Math.max(...longitudes);

//     /*
//      * Don't render thousands of markers.
//      * The API data is still used; only the visible
//      * marker count is limited for browser performance.
//      */
//     validPredictions
//         .slice(0, 300)
//         .forEach((p) => {
//             let x = 50;
//             let y = 50;

//             if (maxLon !== minLon) {
//                 x =
//                     ((numeric(p.lon) - minLon) /
//                         (maxLon - minLon)) *
//                         92 +
//                     4;
//             }

//             if (maxLat !== minLat) {
//                 y =
//                     ((maxLat - numeric(p.lat)) /
//                         (maxLat - minLat)) *
//                         86 +
//                     7;
//             }

//             x = Math.max(
//                 2,
//                 Math.min(98, x)
//             );

//             y = Math.max(
//                 2,
//                 Math.min(98, y)
//             );

//             const style =
//                 alertStyle(
//                     p.riskLevel
//                 );

//             const marker =
//                 document.createElement(
//                     "div"
//                 );

//             marker.className =
//                 "absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group";

//             marker.style.left =
//                 `${x}%`;

//             marker.style.top =
//                 `${y}%`;

//             marker.innerHTML = `
//                 <div
//                     class="relative flex items-center justify-center"
//                     onclick="window.selectHotspot('${encodeURIComponent(
//                         String(p.id)
//                     )}')"
//                 >

//                     <span
//                         class="animate-ping absolute inline-flex h-6 w-6 rounded-full ${
//                             style.dot
//                         } opacity-40"
//                     ></span>

//                     <span
//                         class="relative inline-flex rounded-full
//                                h-3.5 w-3.5
//                                ${style.dot}
//                                border-2 border-white shadow"
//                     ></span>

//                     <div
//                         class="absolute bottom-full mb-2
//                                hidden group-hover:flex
//                                flex-col bg-slate-900
//                                text-white text-[10px]
//                                p-2 rounded shadow-xl
//                                whitespace-nowrap z-50"
//                     >

//                         <span
//                             class="font-bold text-amber-300"
//                         >
//                             ${escapeHtml(
//                                 p.district
//                             )},
//                             ${escapeHtml(
//                                 p.state
//                             )}
//                         </span>

//                         <span class="text-slate-300">
//                             ${escapeHtml(
//                                 p.predictedMaterial
//                             )}
//                             ·
//                             ${escapeHtml(
//                                 p.movement
//                             )}
//                         </span>

//                         <span class="text-slate-300">
//                             Risk:
//                             ${numeric(
//                                 p.riskScore
//                             ).toFixed(1)}/100
//                         </span>

//                         <span class="text-slate-400">
//                             Confidence:
//                             ${numeric(
//                                 p.confidence
//                             ).toFixed(2)}%
//                         </span>

//                         <span class="text-slate-400">
//                             ${
//                                 p.isHighway
//                                     ? "Highway flagged"
//                                     : "No highway flag"
//                             }
//                         </span>

//                     </div>
//                 </div>
//             `;

//             container.appendChild(
//                 marker
//             );
//         });
// }

// /* =========================================================
//    MAP HOTSPOT SELECTION
//    ========================================================= */

// window.selectHotspot =
//     function (encodedId) {
//         const id =
//             decodeURIComponent(
//                 encodedId
//             );

//         const prediction =
//             pravahaPredictions.find(
//                 (p) =>
//                     String(p.id) ===
//                     String(id)
//             );

//         if (!prediction) {
//             return;
//         }

//         pravahaActive =
//             prediction;

//         renderSafely(
//             "selected prediction",
//             () =>
//                 renderSelectedPrediction(
//                     prediction
//                 )
//         );

//         renderSafely(
//             "analysis selectors",
//             () =>
//                 updateAnalysisSelectorsLive(
//                     prediction.state,
//                     prediction.district,
//                     prediction.id
//                 )
//         );

//         renderSafely(
//             "analysis data",
//             () =>
//                 updateAnalysisDataLive(
//                     prediction.id
//                 )
//         );
//     };

// /* =========================================================
//    SELECTED PREDICTION
//    ========================================================= */

// function renderSelectedPrediction(
//     prediction
// ) {
//     if (!prediction) {
//         return;
//     }

//     const style =
//         alertStyle(
//             prediction.riskLevel
//         );

//     setText(
//         "selectedLocName",
//         `${prediction.district} · ${prediction.state}`
//     );

//     setText(
//         "selectedDistrictTag",
//         `${prediction.district}, ${prediction.state}`
//     );

//     if (
//         Number.isFinite(
//             prediction.lat
//         ) &&
//         Number.isFinite(
//             prediction.lon
//         )
//     ) {
//         setText(
//             "selectedLocCoords",
//             `Lat: ${numeric(
//                 prediction.lat
//             ).toFixed(
//                 6
//             )}°N, Lon: ${numeric(
//                 prediction.lon
//             ).toFixed(
//                 6
//             )}°E`
//         );
//     }

//     const badge =
//         getElement(
//             "selectedLocRiskBadge"
//         );

//     if (badge) {
//         badge.textContent =
//             `${prediction.riskLevel} · ${numeric(
//                 prediction.riskScore
//             ).toFixed(1)}/100`;

//         badge.className =
//             `px-2 py-1 rounded text-xs font-bold border ${style.badge}`;
//     }

//     /*
//      * These values are NOT in the ML CSV.
//      * We deliberately do not invent them.
//      */
//     setText(
//         "selectedLocRain",
//         "Not available in ML CSV"
//     );

//     setText(
//         "selectedLocSoil",
//         "Not available in ML CSV"
//     );

//     setText(
//         "selectedLocSlope",
//         "Not available in ML CSV"
//     );

//     setText(
//         "selectedLocDisp",
//         "Not available in ML CSV"
//     );

//     setText(
//         "selectedLocAiReason",
//         `Predicted material: ${
//             prediction.predictedMaterial
//         }. Movement class: ${
//             prediction.movement
//         }. ML confidence: ${numeric(
//             prediction.confidence
//         ).toFixed(
//             2
//         )}%. Operational risk score: ${numeric(
//             prediction.riskScore
//         ).toFixed(
//             1
//         )}/100.${
//             prediction.isHighway
//                 ? " Highway-associated record."
//                 : ""
//         }`
//     );

//     const actions =
//         getElement(
//             "selectedLocActions"
//         );

//     if (actions) {
//         const actionItems = [
//             "Review the ML-ranked location in the GIS view.",

//             prediction.isHighway
//                 ? "Prioritize transport-corridor inspection because Is_Highway is flagged."
//                 : "Review the slope and material conditions at the predicted location.",

//             "Use ML confidence together with field observations before issuing an operational warning."
//         ];

//         actions.innerHTML =
//             actionItems
//                 .map(
//                     (item) =>
//                         `<li>${escapeHtml(
//                             item
//                         )}</li>`
//                 )
//                 .join("");
//     }
// }

// /* =========================================================
//    MINI ALERTS
//    ========================================================= */

// function renderMiniAlertsLive() {
//     const container =
//         getElement(
//             "dashboardMiniAlerts"
//         );

//     if (!container) {
//         return;
//     }

//     if (!pravahaAlerts.length) {
//         container.innerHTML = `
//             <div class="text-xs text-slate-500 p-2">
//                 No ML alerts currently available.
//             </div>
//         `;

//         return;
//     }

//     container.innerHTML =
//         pravahaAlerts
//             .slice(0, 6)
//             .map((alert) => {
//                 const style =
//                     alertStyle(
//                         alert.severity
//                     );

//                 return `
//                     <div
//                         class="p-2 rounded
//                                bg-slate-50
//                                border border-slate-200"
//                     >

//                         <div
//                             class="flex items-center
//                                    justify-between gap-2"
//                         >

//                             <span
//                                 class="text-slate-900
//                                        text-[11px]
//                                        font-bold
//                                        truncate"
//                             >
//                                 ${escapeHtml(
//                                     alert.location
//                                 )}
//                             </span>

//                             <span
//                                 class="px-1.5 py-0.5
//                                        text-[9px]
//                                        rounded font-bold
//                                        border
//                                        ${style.badge}"
//                             >
//                                 ${escapeHtml(
//                                     alert.severity
//                                 )}
//                             </span>

//                         </div>

//                         <p
//                             class="text-[10px]
//                                    text-slate-600
//                                    mt-0.5"
//                         >
//                             ${escapeHtml(
//                                 alert.hazard
//                             )}
//                         </p>

//                         <div
//                             class="text-[9px]
//                                    text-slate-400
//                                    mt-1
//                                    flex justify-between"
//                         >

//                             <span>
//                                 Confidence
//                                 ${numeric(
//                                     alert.confidence
//                                 ).toFixed(1)}%
//                             </span>

//                             <span>
//                                 Risk
//                                 ${numeric(
//                                     alert.score
//                                 ).toFixed(1)}
//                             </span>

//                         </div>

//                     </div>
//                 `;
//             })
//             .join("");
// }

// /* =========================================================
//    DASHBOARD TABLE
//    ========================================================= */

// function renderDashboardTableLive() {
//     const tbody =
//         getElement(
//             "dashboardVulnerableTable"
//         );

//     if (!tbody) {
//         return;
//     }

//     tbody.innerHTML =
//         pravahaPredictions
//             .slice()
//             .sort(
//                 (a, b) =>
//                     numeric(
//                         b.riskScore
//                     ) -
//                     numeric(
//                         a.riskScore
//                     )
//             )
//             .slice(0, 15)
//             .map((p) => {
//                 const style =
//                     alertStyle(
//                         p.riskLevel
//                     );

//                 return `
//                     <tr
//                         class="hover:bg-slate-50 transition"
//                     >

//                         <td
//                             class="p-2.5
//                                    font-bold
//                                    text-slate-900"
//                         >
//                             ${escapeHtml(
//                                 p.district
//                             )}
//                         </td>

//                         <td
//                             class="p-2.5
//                                    text-slate-600"
//                         >
//                             ${escapeHtml(
//                                 p.state
//                             )}
//                         </td>

//                         <td
//                             class="p-2.5"
//                         >
//                             <span
//                                 class="px-1.5 py-0.5
//                                        rounded
//                                        bg-blue-50
//                                        text-blue-700
//                                        border
//                                        border-blue-200
//                                        font-semibold
//                                        text-[10px]"
//                             >
//                                 ${escapeHtml(
//                                     p.predictedMaterial
//                                 )}
//                                 /
//                                 ${escapeHtml(
//                                     p.movement
//                                 )}
//                             </span>
//                         </td>

//                         <td
//                             class="p-2.5
//                                    text-center
//                                    font-bold
//                                    font-mono"
//                         >
//                             <span
//                                 class="px-2 py-0.5
//                                        rounded
//                                        border
//                                        ${style.badge}"
//                             >
//                                 ${numeric(
//                                     p.riskScore
//                                 ).toFixed(1)}
//                             </span>
//                         </td>

//                         <td
//                             class="p-2.5
//                                    text-slate-600"
//                         >
//                             ${numeric(
//                                 p.confidence
//                             ).toFixed(
//                                 2
//                             )}%
//                         </td>

//                         <td
//                             class="p-2.5
//                                    text-slate-600"
//                         >
//                             ${
//                                 p.isHighway
//                                     ? "Yes"
//                                     : "No"
//                             }
//                         </td>

//                         <td
//                             class="p-2.5
//                                    text-right"
//                         >
//                             ${escapeHtml(
//                                 p.riskLevel
//                             )}
//                         </td>

//                     </tr>
//                 `;
//             })
//             .join("");
// }

// /* =========================================================
//    ALERTS PAGE
//    ========================================================= */

// function renderAlertsLive(
//     filter = "ALL"
// ) {
//     const container =
//         getElement(
//             "alertsFullList"
//         );

//     if (!container) {
//         return;
//     }

//     let alerts =
//         pravahaAlerts.slice();

//     if (
//         filter &&
//         String(
//             filter
//         ).toUpperCase() !== "ALL"
//     ) {
//         alerts =
//             alerts.filter(
//                 (a) =>
//                     String(
//                         a.severity
//                     ).toUpperCase() ===
//                     String(
//                         filter
//                     ).toUpperCase()
//             );
//     }

//     if (!alerts.length) {
//         container.innerHTML = `
//             <div
//                 class="p-4
//                        text-center
//                        text-xs
//                        text-slate-500"
//             >
//                 No alerts match this filter.
//             </div>
//         `;

//         return;
//     }

//     container.innerHTML =
//         alerts
//             .map((a) => {
//                 const style =
//                     alertStyle(
//                         a.severity
//                     );

//                 return `
//                     <div
//                         class="bg-white
//                                rounded-md
//                                border
//                                border-slate-200
//                                p-3.5
//                                shadow-sm
//                                border-l-4
//                                ${style.border}
//                                space-y-2"
//                     >

//                         <div
//                             class="flex
//                                    flex-wrap
//                                    items-center
//                                    justify-between
//                                    gap-2"
//                         >

//                             <div
//                                 class="flex
//                                        items-center
//                                        gap-2"
//                             >

//                                 <span
//                                     class="px-2
//                                            py-0.5
//                                            rounded
//                                            text-xs
//                                            font-bold
//                                            border
//                                            ${style.badge}"
//                                 >
//                                     ${escapeHtml(
//                                         a.severity
//                                     )}
//                                 </span>

//                                 <h3
//                                     class="font-bold
//                                            text-sm
//                                            text-slate-900"
//                                 >
//                                     ${escapeHtml(
//                                         a.location
//                                     )}
//                                 </h3>

//                             </div>

//                             <span
//                                 class="text-xs
//                                        font-mono
//                                        text-slate-400"
//                             >
//                                 ML
//                             </span>

//                         </div>

//                         <div
//                             class="text-xs
//                                    text-slate-700"
//                         >
//                             <strong
//                                 class="text-slate-900"
//                             >
//                                 Hazard:
//                             </strong>

//                             ${escapeHtml(
//                                 a.hazard
//                             )}

//                             <br />

//                             ${escapeHtml(
//                                 a.desc
//                             )}
//                         </div>

//                         <div
//                             class="bg-slate-50
//                                    p-2
//                                    rounded
//                                    border
//                                    border-slate-200
//                                    text-xs
//                                    text-slate-800"
//                         >

//                             <div
//                                 class="flex
//                                        items-center
//                                        justify-between
//                                        gap-3"
//                             >

//                                 <div>

//                                     <strong
//                                         class="text-blue-700
//                                                uppercase
//                                                text-[10px]
//                                                tracking-wider
//                                                block"
//                                     >
//                                         Recommended Review
//                                     </strong>

//                                     ${escapeHtml(
//                                         a.action
//                                     )}

//                                 </div>

//                                 <button
//                                     onclick="switchTab('risk-analysis')"
//                                     class="bg-brand-800
//                                            hover:bg-brand-900
//                                            text-white
//                                            text-[11px]
//                                            px-2.5
//                                            py-1
//                                            rounded
//                                            font-semibold
//                                            shrink-0"
//                                 >
//                                     Inspect
//                                 </button>

//                             </div>

//                         </div>

//                     </div>
//                 `;
//             })
//             .join("");
// }

// window.filterAlerts =
//     function (type) {
//         renderSafely(
//             "alert filter",
//             () =>
//                 renderAlertsLive(
//                     type
//                 )
//         );
//     };

// /* =========================================================
//    ZONE DATA
//    ========================================================= */

// function renderZonesLive() {
//     const container =
//         getElement(
//             "zoneAlerts"
//         );

//     if (!container) {
//         return;
//     }

//     if (!pravahaZones.length) {
//         container.innerHTML = `
//             <div
//                 class="text-xs
//                        text-slate-500"
//             >
//                 No zone data returned from API.
//             </div>
//         `;

//         return;
//     }

//     container.innerHTML =
//         pravahaZones
//             .map((zone) => {
//                 const zoneScore =
//                     numeric(
//                         zone.risk_score ??
//                         zone.riskScore,
//                         0
//                     );

//                 const zoneAlert =
//                     zone.alert ||
//                     riskLevelFromScore(
//                         zoneScore
//                     );

//                 const style =
//                     alertStyle(
//                         zoneAlert
//                     );

//                 return `
//                     <div
//                         class="border-2
//                                rounded-2xl
//                                p-5
//                                shadow
//                                ${style.badge}"
//                     >

//                         <div
//                             class="flex
//                                    justify-between
//                                    items-center
//                                    mb-3"
//                         >

//                             <h4
//                                 class="text-lg
//                                        font-bold"
//                             >
//                                 📍
//                                 ${escapeHtml(
//                                     zone.zone
//                                 )}
//                             </h4>

//                             <span
//                                 class="font-bold"
//                             >
//                                 ${escapeHtml(
//                                     zoneAlert
//                                 )}
//                             </span>

//                         </div>

//                         <p
//                             class="text-sm"
//                         >
//                             ${numeric(
//                                 zone.total_predictions
//                             ).toLocaleString()}
//                             predictions
//                             · Avg confidence
//                             ${numeric(
//                                 zone.average_confidence
//                             ).toFixed(
//                                 2
//                             )}%
//                         </p>

//                         <p
//                             class="text-sm
//                                    mt-1"
//                         >
//                             Dominant:
//                             ${escapeHtml(
//                                 zone.dominant_failure ||
//                                 "N/A"
//                             )}
//                         </p>

//                         <p
//                             class="text-sm
//                                    mt-1"
//                         >
//                             Highway-flagged:
//                             ${numeric(
//                                 zone.highway_predictions ??
//                                 zone.highway_count,
//                                 0
//                             ).toLocaleString()}
//                         </p>

//                         <p
//                             class="text-sm
//                                    mt-1
//                                    font-semibold"
//                         >
//                             Average ML risk:
//                             ${zoneScore.toFixed(
//                                 1
//                             )}/100
//                         </p>

//                     </div>
//                 `;
//             })
//             .join("");
// }

// /* =========================================================
//    VULNERABLE ZONES TABLE
//    ========================================================= */

// function renderVulnerableTableLive() {
//     const tbody =
//         getElement(
//             "vulnerableFullTable"
//         );

//     if (!tbody) {
//         return;
//     }

//     if (!pravahaZones.length) {
//         tbody.innerHTML = `
//             <tr>
//                 <td
//                     colspan="7"
//                     class="p-4
//                            text-center
//                            text-xs
//                            text-slate-500"
//                 >
//                     No zone records available.
//                 </td>
//             </tr>
//         `;

//         return;
//     }

//     tbody.innerHTML =
//         pravahaZones
//             .map((zone) => {
//                 const score =
//                     numeric(
//                         zone.risk_score ??
//                         zone.riskScore,
//                         0
//                     );

//                 const alert =
//                     zone.alert ||
//                     riskLevelFromScore(
//                         score
//                     );

//                 const style =
//                     alertStyle(
//                         alert
//                     );

//                 return `
//                     <tr
//                         class="hover:bg-slate-50"
//                     >

//                         <td
//                             class="p-3
//                                    font-bold
//                                    text-slate-900"
//                         >
//                             ${escapeHtml(
//                                 zone.zone
//                             )}
//                         </td>

//                         <td
//                             class="p-3
//                                    text-slate-600"
//                         >
//                             ${escapeHtml(
//                                 zone.zone
//                             )}
//                         </td>

//                         <td
//                             class="p-3"
//                         >
//                             ${escapeHtml(
//                                 zone.dominant_failure ||
//                                 "N/A"
//                             )}
//                         </td>

//                         <td
//                             class="p-3
//                                    text-center
//                                    font-mono
//                                    font-bold"
//                         >
//                             ${numeric(
//                                 zone.total_predictions
//                             ).toLocaleString()}
//                         </td>

//                         <td
//                             class="p-3
//                                    text-slate-600"
//                         >
//                             ${numeric(
//                                 zone.highway_predictions ??
//                                 zone.highway_count,
//                                 0
//                             ).toLocaleString()}
//                         </td>

//                         <td
//                             class="p-3
//                                    font-semibold"
//                         >
//                             <span
//                                 class="px-2
//                                        py-0.5
//                                        rounded
//                                        border
//                                        ${style.badge}"
//                             >
//                                 ${score.toFixed(
//                                     1
//                                 )}/100
//                             </span>
//                         </td>

//                         <td
//                             class="p-3
//                                    text-right
//                                    font-bold"
//                         >
//                             ${escapeHtml(
//                                 alert
//                             )}
//                         </td>

//                     </tr>
//                 `;
//             })
//             .join("");
// }

// /* =========================================================
//    ANALYSIS SELECTORS
//    ========================================================= */

// function updateAnalysisSelectorsLive(
//     requestedState,
//     requestedDistrict,
//     requestedId
// ) {
//     const stateSelect =
//         getElement(
//             "analysisState"
//         );

//     const districtSelect =
//         getElement(
//             "analysisDistrict"
//         );

//     const locationSelect =
//         getElement(
//             "analysisLocation"
//         );

//     /*
//      * Selectors are optional.
//      * If your current page doesn't have them,
//      * nothing breaks.
//      */
//     if (
//         !stateSelect ||
//         !districtSelect ||
//         !locationSelect
//     ) {
//         return;
//     }

//     const states =
//         [
//             ...new Set(
//                 pravahaPredictions
//                     .map(
//                         (p) =>
//                             p.state
//                     )
//                     .filter(Boolean)
//             )
//         ].sort();

//     stateSelect.innerHTML =
//         states
//             .map(
//                 (state) =>
//                     `<option value="${escapeHtml(
//                         state
//                     )}">
//                         ${escapeHtml(
//                             state
//                         )}
//                     </option>`
//             )
//             .join("");

//     if (
//         requestedState &&
//         states.includes(
//             requestedState
//         )
//     ) {
//         stateSelect.value =
//             requestedState;
//     } else if (
//         pravahaActive &&
//         states.includes(
//             pravahaActive.state
//         )
//     ) {
//         stateSelect.value =
//             pravahaActive.state;
//     }

//     const selectedState =
//         stateSelect.value;

//     const districts =
//         [
//             ...new Set(
//                 pravahaPredictions
//                     .filter(
//                         (p) =>
//                             p.state ===
//                             selectedState
//                     )
//                     .map(
//                         (p) =>
//                             p.district
//                     )
//                     .filter(Boolean)
//             )
//         ].sort();

//     districtSelect.innerHTML =
//         districts
//             .map(
//                 (district) =>
//                     `<option value="${escapeHtml(
//                         district
//                     )}">
//                         ${escapeHtml(
//                             district
//                         )}
//                     </option>`
//             )
//             .join("");

//     if (
//         requestedDistrict &&
//         districts.includes(
//             requestedDistrict
//         )
//     ) {
//         districtSelect.value =
//             requestedDistrict;
//     } else if (
//         pravahaActive &&
//         districts.includes(
//             pravahaActive.district
//         )
//     ) {
//         districtSelect.value =
//             pravahaActive.district;
//     }

//     const selectedDistrict =
//         districtSelect.value;

//     const locations =
//         pravahaPredictions
//             .filter(
//                 (p) =>
//                     p.state ===
//                         selectedState &&
//                     p.district ===
//                         selectedDistrict
//             )
//             .slice(0, 500);

//     locationSelect.innerHTML =
//         locations
//             .map(
//                 (p) =>
//                     `<option value="${escapeHtml(
//                         String(p.id)
//                     )}">
//                         ${escapeHtml(
//                             String(p.id)
//                         )}
//                         ·
//                         ${escapeHtml(
//                             p.predictedMaterial
//                         )}
//                         ·
//                         ${numeric(
//                             p.confidence
//                         ).toFixed(1)}%
//                     </option>`
//             )
//             .join("");

//     if (
//         requestedId &&
//         locations.some(
//             (p) =>
//                 String(p.id) ===
//                 String(
//                     requestedId
//                 )
//         )
//     ) {
//         locationSelect.value =
//             requestedId;
//     }
// }

// /* =========================================================
//    ANALYSIS DATA
//    ========================================================= */

// function updateAnalysisDataLive(
//     requestedId
// ) {
//     const locationSelect =
//         getElement(
//             "analysisLocation"
//         );

//     const selectedId =
//         requestedId ||
//         locationSelect?.value;

//     let prediction =
//         pravahaPredictions.find(
//             (p) =>
//                 String(
//                     p.id
//                 ) ===
//                 String(
//                     selectedId
//                 )
//         );

//     if (!prediction) {
//         prediction =
//             pravahaActive ||
//             findHighestRiskPrediction(
//                 pravahaPredictions
//             );
//     }

//     if (!prediction) {
//         return;
//     }

//     pravahaActive =
//         prediction;

//     const score =
//         numeric(
//             prediction.riskScore,
//             0
//         );

//     setText(
//         "anaRiskScore",
//         score.toFixed(1)
//     );

//     setText(
//         "anaRiskCategory",
//         `${prediction.riskLevel} RISK ZONE`
//     );

//     setText(
//         "anaInfra",
//         prediction.isHighway
//             ? "Highway Flagged"
//             : "No Highway Flag"
//     );

//     setText(
//         "anaAiReason",
//         `Predicted ${prediction.predictedMaterial} with ${numeric(
//             prediction.confidence
//         ).toFixed(
//             2
//         )}% confidence. Movement class: ${
//             prediction.movement
//         }. Risk score: ${
//             score.toFixed(1)
//         }/100.`
//     );

//     /*
//      * If your page contains a risk gauge,
//      * safely update it.
//      */
//     updateExistingGauge(
//         score
//     );
// }

// /* =========================================================
//    SAFE GAUGE UPDATE
//    ========================================================= */

// function updateExistingGauge(
//     score
// ) {
//     const canvas =
//         getElement(
//             "anaGaugeChart"
//         );

//     if (
//         !canvas ||
//         typeof Chart === "undefined"
//     ) {
//         return;
//     }

//     const chart =
//         Chart.getChart(canvas);

//     if (!chart) {
//         return;
//     }

//     if (
//         chart.data &&
//         chart.data.datasets &&
//         chart.data.datasets.length
//     ) {
//         chart.data.datasets[0].data = [
//             numeric(score),
//             Math.max(
//                 0,
//                 100 -
//                     numeric(
//                         score
//                     )
//             )
//         ];

//         chart.update();
//     }
// }

// /* =========================================================
//    TREND / ZONE RISK CHART
//    ========================================================= */

// /*
//  * THIS IS THE IMPORTANT FIX:
//  *
//  * Before creating a chart, we check whether Chart.js
//  * already has a chart attached to this exact canvas.
//  *
//  * If it does, we update/reuse it rather than creating
//  * another chart over the same canvas.
//  */

// function updateTrendChartLive() {
//     const canvas =
//         getElement(
//             "dashboardTrendChart"
//         );

//     /*
//      * No chart canvas on current page.
//      */
//     if (!canvas) {
//         return;
//     }

//     /*
//      * Chart.js has not loaded.
//      */
//     if (
//         typeof Chart ===
//         "undefined"
//     ) {
//         console.warn(
//             "Chart.js is not loaded."
//         );

//         return;
//     }

//     const labels =
//         pravahaZones
//             .slice(0, 10)
//             .map(
//                 (zone) =>
//                     zone.zone
//             );

//     const values =
//         pravahaZones
//             .slice(0, 10)
//             .map(
//                 (zone) =>
//                     numeric(
//                         zone.risk_score ??
//                         zone.riskScore,
//                         0
//                     )
//             );

//     /*
//      * First ask Chart.js whether this canvas is
//      * already being used.
//      */
//     let existingChart =
//         Chart.getChart(canvas);

//     /*
//      * If an existing chart is found, update it.
//      * DO NOT call new Chart() again.
//      */
//     if (existingChart) {
//         existingChart.data.labels =
//             labels;

//         if (
//             existingChart.data.datasets &&
//             existingChart.data.datasets[0]
//         ) {
//             existingChart.data.datasets[0]
//                 .data =
//                 values;
//         } else {
//             existingChart.data.datasets =
//                 [
//                     {
//                         label:
//                             "Average ML Risk Score",
//                         data: values
//                     }
//                 ];
//         }

//         existingChart.update(
//             "none"
//         );

//         pravahaRiskChart =
//             existingChart;

//         return;
//     }

//     /*
//      * No chart exists on this canvas.
//      * Safe to create one.
//      */
//     pravahaRiskChart =
//         new Chart(
//             canvas,
//             {
//                 type: "bar",

//                 data: {
//                     labels,

//                     datasets: [
//                         {
//                             label:
//                                 "Average ML Risk Score",

//                             data: values
//                         }
//                     ]
//                 },

//                 options: {
//                     responsive:
//                         true,

//                     maintainAspectRatio:
//                         false,

//                     animation:
//                         false,

//                     plugins: {
//                         legend: {
//                             display:
//                                 false
//                         }
//                     },

//                     scales: {
//                         y: {
//                             min: 0,
//                             max: 100,

//                             beginAtZero:
//                                 true
//                         }
//                     }
//                 }
//             }
//         );
// }

// /* =========================================================
//    MANUAL CHART CLEANUP
//    ========================================================= */

// function destroyTrendChart() {
//     const canvas =
//         getElement(
//             "dashboardTrendChart"
//         );

//     /*
//      * Destroy the chart tracked by our variable.
//      */
//     if (
//         pravahaRiskChart &&
//         typeof pravahaRiskChart.destroy ===
//             "function"
//     ) {
//         try {
//             pravahaRiskChart.destroy();
//         } catch (error) {
//             console.warn(
//                 "Chart cleanup warning:",
//                 error
//             );
//         }

//         pravahaRiskChart = null;
//     }

//     /*
//      * Also check Chart.js itself.
//      */
//     if (
//         canvas &&
//         typeof Chart !== "undefined"
//     ) {
//         const chart =
//             Chart.getChart(canvas);

//         if (chart) {
//             try {
//                 chart.destroy();
//             } catch (error) {
//                 console.warn(
//                     "Existing chart cleanup warning:",
//                     error
//                 );
//             }
//         }
//     }
// }

// /* =========================================================
//    COMPATIBILITY FUNCTIONS
//    ========================================================= */

// window.renderDashboardMap =
//     function () {
//         renderSafely(
//             "dashboard map",
//             renderDashboardMapLive
//         );
//     };

// window.renderDashboardMiniAlerts =
//     function () {
//         renderSafely(
//             "mini alerts",
//             renderMiniAlertsLive
//         );
//     };

// window.renderDashboardVulnerableTable =
//     function () {
//         renderSafely(
//             "dashboard table",
//             renderDashboardTableLive
//         );
//     };

// window.renderAlertsList =
//     function (filter) {
//         renderSafely(
//             "alerts",
//             () =>
//                 renderAlertsLive(
//                     filter || "ALL"
//                 )
//         );
//     };

// window.renderVulnerableFullTable =
//     function () {
//         renderSafely(
//             "vulnerable table",
//             renderVulnerableTableLive
//         );
//     };

// window.updateAnalysisSelectors =
//     function () {
//         renderSafely(
//             "analysis selectors",
//             () =>
//                 updateAnalysisSelectorsLive()
//         );
//     };

// window.updateAnalysisData =
//     function () {
//         renderSafely(
//             "analysis data",
//             () =>
//                 updateAnalysisDataLive()
//         );
//     };

// /* =========================================================
//    REFRESH FUNCTION
//    ========================================================= */

// window.refreshPravahaML =
//     function () {
//         loadPravahaML();
//     };

// /* =========================================================
//    INITIAL LOAD
//    ========================================================= */

// document.addEventListener(
//     "DOMContentLoaded",
//     function () {
//         /*
//          * Give the existing HTML/Chart.js scripts a moment
//          * to finish initializing before we update the dashboard.
//          */
//         setTimeout(
//             function () {
//                 loadPravahaML();
//             },
//             300
//         );
//     }
// );

// /* =========================================================
//    AUTO REFRESH
//    ========================================================= */

// setInterval(
//     function () {
//         loadPravahaML();
//     },
//     REFRESH_INTERVAL
// );






/* =========================================================================
   PRAVAHA AI — LANDSLIDE DASHBOARD
   =========================================================================

   FRONTEND FILES:
      index.html
      landslide-dashboard.js

   No separate CSS file is required.

   -------------------------------------------------------------------------
   API CONFIGURATION
   -------------------------------------------------------------------------

   Default backend:
      http://127.0.0.1:5000

   You can change it from the "API Configuration" button.

   Example backend endpoints this frontend attempts automatically:

      GET /api/predictions
      GET /api/landslides
      GET /api/landslide-data
      GET /api/ml-predictions
      GET /api/data
      GET /predictions

   Supported JSON response forms:

      [ {...}, {...} ]

      {
        "data": [...]
      }

      {
        "predictions": [...]
      }

      {
        "records": [...]
      }

      {
        "results": [...]
      }

   Supported ML fields:

      ID / id
      State / state
      District / district
      Latitude / lat
      Longitude / lon
      Hazard / hazard
      Predicted Hazard / predicted_hazard
      Confidence / confidence
      Event Type / event_type

   -------------------------------------------------------------------------
   ========================================================================= */

(() => {

  "use strict";

  /* =======================================================================
     CONFIG
     ======================================================================= */

  const API_BASE_URL =
    window.PRAVAHA_API_BASE_URL ||
    localStorage.getItem("PRAVAHA_API_BASE_URL") ||
    "http://127.0.0.1:5000";


  const API_ENDPOINTS = [

    "/api/predictions",
    "/api/landslides",
    "/api/landslide-data",
    "/api/ml-predictions",
    "/api/data",
    "/predictions"

  ];


  const AUTO_REFRESH_MS = 120000;


  /* =======================================================================
     APPLICATION STATE
     ======================================================================= */

  const app = {

    records: [],

    selectedRecord: null,

    apiConnected: false,

    apiEndpoint: null,

    lastUpdated: null,

    dashboardMap: null,

    fullMap: null,

    dashboardCluster: null,

    fullCluster: null,

    dashboardMarkers: new Map(),

    fullMarkers: new Map(),

    mapHazardFilter: "all",

    charts: {

      trend: null,

      gauge: null

    },

    refreshTimer: null

  };


  /* =======================================================================
     DOM HELPER
     ======================================================================= */

  function $(id) {

    return document.getElementById(id);

  }


  function setText(id, value) {

    const element = $(id);

    if (!element) return;

    element.textContent =
      value === null ||
      value === undefined
        ? "--"
        : String(value);

  }


  function escapeHtml(value) {

    return String(value ?? "")

      .replace(/&/g, "&amp;")

      .replace(/</g, "&lt;")

      .replace(/>/g, "&gt;")

      .replace(/"/g, "&quot;")

      .replace(/'/g, "&#039;");

  }


  function numeric(value, fallback = null) {

    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : fallback;

  }


  /* =======================================================================
     RISK
     ======================================================================= */

  function normalizeConfidence(value) {

    const n = numeric(value);

    if (n === null) {

      return null;

    }

    if (n >= 0 && n <= 1) {

      return n * 100;

    }

    return Math.max(
      0,
      Math.min(100, n)
    );

  }


  function getRiskScore(record) {

    const direct =

      numeric(record.riskScore) ??

      numeric(record.risk_score) ??

      numeric(record.risk) ??

      numeric(record.score_100);


    if (direct !== null) {

      return direct <= 1
        ? direct * 100
        : Math.max(0, Math.min(100, direct));

    }


    const confidence =
      normalizeConfidence(

        record.confidence ??

        record.Confidence ??

        record.probability ??

        record.prediction_probability ??

        record.model_confidence

      );


    return confidence ?? 0;

  }


  function getRiskCategory(score) {

    if (score >= 80) {
      return "CRITICAL";
    }

    if (score >= 60) {
      return "HIGH";
    }

    if (score >= 40) {
      return "MODERATE";
    }

    return "LOW";

  }


  function getRiskColor(score) {

    if (score >= 80) {
      return "#ef4444";
    }

    if (score >= 60) {
      return "#f97316";
    }

    if (score >= 40) {
      return "#f59e0b";
    }

    return "#10b981";

  }


  function normalizeEvent(value) {

    const valueText =
      String(value ?? "")
        .trim()
        .toLowerCase();


    if (valueText.includes("slide")) {

      return "Slide";

    }

    if (valueText.includes("fall")) {

      return "Fall";

    }

    if (valueText.includes("flow")) {

      return "Flow";

    }

    if (valueText.includes("subsidence")) {

      return "Subsidence";

    }

    return value
      ? String(value)
      : "Other";

  }


  /* =======================================================================
     RECORD NORMALIZATION
     ======================================================================= */

  function normalizeRecord(raw, index) {

    const latitude =

      numeric(raw.lat) ??

      numeric(raw.latitude) ??

      numeric(raw.Latitude);


    const longitude =

      numeric(raw.lon) ??

      numeric(raw.lng) ??

      numeric(raw.longitude) ??

      numeric(raw.Longitude);


    const confidence =

      normalizeConfidence(

        raw.confidence ??

        raw.Confidence ??

        raw.probability ??

        raw.prediction_probability ??

        raw.model_confidence

      );


    const riskScore =
      getRiskScore(raw);


    const hazard =

      raw.hazard ??

      raw.Hazard ??

      raw.original_hazard ??

      raw.originalHazard ??

      raw.hazard_type ??

      raw.actualMaterial ??

      raw.actual_material ??

      raw.Actual_Material ??

      raw["Material Involved"] ??

      "Unknown";


    const prediction =

      raw.predicted_hazard ??

      raw["Predicted Hazard"] ??

      raw.predictedHazard ??

      raw.prediction ??

      raw.predicted ??

      raw.predicted_class ??

      raw.model_prediction ??

      raw.predictedMaterial ??

      raw.predicted_material ??

      raw.Predicted_Material ??

      hazard;


    const eventType =

      raw.event_type ??

      raw["Event Type"] ??

      raw.eventType ??

      raw.event ??

      raw.Event ??

      "Other";


    const id =

      raw.id ??

      raw.ID ??

      raw.record_id ??

      raw.landslide_id ??

      raw.serial_no ??

      raw.serial ??

      `ML-${index + 1}`;


    return {

      raw: raw,

      id: String(id),

      state: String(
        raw.state ??
        raw.State ??
        "Unknown"
      ),

      district: String(
        raw.district ??
        raw.District ??
        "Unknown"
      ),

      lat: latitude,

      lon: longitude,

      hazard: String(hazard),

      predictedHazard: String(prediction),

      confidence: confidence,

      riskScore: riskScore,

      riskCategory:
        getRiskCategory(riskScore),

      eventType:
        normalizeEvent(eventType)

    };

  }


  /* =======================================================================
     API STATUS
     ======================================================================= */

  function setApiStatus(
    message,
    mode = "loading"
  ) {

    const element = $("apiStatus");

    if (!element) return;


    let backgroundClass =
      "api-loading";

    let dotClass =
      "bg-blue-500";


    if (mode === "ok") {

      backgroundClass =
        "api-ok";

      dotClass =
        "bg-emerald-500";

    }


    if (mode === "error") {

      backgroundClass =
        "api-error";

      dotClass =
        "bg-red-500";

    }


    element.className =
      `p-3 rounded-lg text-xs border ${backgroundClass}`;


    element.innerHTML =

      `<span class="status-dot ${dotClass}"></span>` +

      escapeHtml(message);

  }


  /* =======================================================================
     API PAYLOAD PARSER
     ======================================================================= */

  function findArrayDeep(
    object,
    depth = 0
  ) {

    if (
      object === null ||
      object === undefined ||
      depth > 6
    ) {

      return null;

    }


    if (Array.isArray(object)) {

      return object;

    }


    if (
      typeof object !== "object"
    ) {

      return null;

    }


    const preferredKeys = [

      "predictions",
      "prediction",
      "landslides",
      "records",
      "results",
      "data",
      "items",
      "rows"

    ];


    for (
      const key of preferredKeys
    ) {

      if (
        Object.prototype.hasOwnProperty.call(
          object,
          key
        )
      ) {

        const found =
          findArrayDeep(
            object[key],
            depth + 1
          );


        if (found) {

          return found;

        }

      }

    }


    for (
      const value of Object.values(object)
    ) {

      const found =
        findArrayDeep(
          value,
          depth + 1
        );


      if (found) {

        return found;

      }

    }


    return null;

  }


  function parsePredictionPayload(
    payload
  ) {

    const rows =
      findArrayDeep(payload);


    if (!rows) {

      return [];

    }


    return rows

      .map(
        (row, index) =>
          normalizeRecord(
            row,
            index
          )
      )

      .filter(
        record =>

          Number.isFinite(
            record.lat
          ) &&

          Number.isFinite(
            record.lon
          )
      );

  }


  /* =======================================================================
     FETCH
     ======================================================================= */

  async function fetchJson(
    url,
    timeoutMs = 12000
  ) {

    const controller =
      new AbortController();


    const timeout =
      setTimeout(
        () => controller.abort(),
        timeoutMs
      );


    try {

      const response =
        await fetch(
          url,
          {

            method: "GET",

            headers: {
              Accept:
                "application/json"
            },

            cache: "no-store",

            signal:
              controller.signal

          }
        );


      const responseText =
        await response.text();


      let payload;


      try {

        payload =
          responseText
            ? JSON.parse(
                responseText
              )
            : {};

      } catch {

        throw new Error(
          `Non-JSON response from ${url}`
        );

      }


      if (!response.ok) {

        throw new Error(

          payload?.message ||

          payload?.error ||

          `HTTP ${response.status}`

        );

      }


      return payload;

    } finally {

      clearTimeout(timeout);

    }

  }


  /* =======================================================================
     LOAD API RECORDS
     ======================================================================= */

  async function loadPredictionData() {

    let lastError =
      null;


    for (
      const endpoint of API_ENDPOINTS
    ) {

      const url =

        API_BASE_URL
          .replace(/\/$/, "") +

        endpoint;


      try {

        const payload =
          await fetchJson(
            url
          );


        const records =
          parsePredictionPayload(
            payload
          );


        if (records.length > 0) {

          app.apiEndpoint =
            endpoint;

          return records;

        }


        /*
          A valid empty payload is still treated as a
          successful endpoint.
        */

        if (

          Array.isArray(
            payload
          ) ||

          payload?.data ||

          payload?.predictions ||

          payload?.records ||

          payload?.results

        ) {

          app.apiEndpoint =
            endpoint;

          return [];

        }

      } catch (error) {

        lastError =
          error;

      }

    }


    throw (

      lastError ||

      new Error(
        "No compatible API endpoint was found."
      )

    );

  }


  /* =======================================================================
     DEMO FALLBACK
     ======================================================================= */

  function demoRecords() {

    const demo = [

      [
        "DEMO-001",
        "Sikkim",
        "East Sikkim",
        27.3487,
        88.6005,
        "Debris",
        "Debris",
        0.95,
        "Slide"
      ],

      [
        "DEMO-002",
        "Mizoram",
        "Aizawl",
        23.7310,
        92.7064,
        "Debris",
        "Debris",
        0.91,
        "Slide"
      ],

      [
        "DEMO-003",
        "Manipur",
        "Noney",
        24.7983,
        93.7241,
        "Debris",
        "Debris",
        0.88,
        "Slide"
      ],

      [
        "DEMO-004",
        "Arunachal Pradesh",
        "Dibang Valley",
        28.4944,
        95.8252,
        "Rock",
        "Rock",
        0.97,
        "Fall"
      ]

    ];


    return demo.map(
      (r, index) =>

        normalizeRecord(

          {

            id: r[0],

            state: r[1],

            district: r[2],

            lat: r[3],

            lon: r[4],

            hazard: r[5],

            predicted_hazard: r[6],

            confidence: r[7],

            event_type: r[8]

          },

          index

        )

    );

  }


  /* =======================================================================
     LEAFLET ICON
     ======================================================================= */

  function createRiskIcon(
    riskScore
  ) {

    const color =
      getRiskColor(
        riskScore
      );


    return L.divIcon({

      className: "",

      html: `

        <div class="pravaha-marker">

          <div
            class="pulse"
            style="background:${color}">
          </div>

          <div
            class="core"
            style="background:${color}">
          </div>

        </div>

      `,

      iconSize: [
        22,
        22
      ],

      iconAnchor: [
        11,
        11
      ],

      popupAnchor: [
        0,
        -12
      ]

    });

  }


  /* =======================================================================
     POPUP
     ======================================================================= */

  function buildPopup(
    record
  ) {

    const color =
      getRiskColor(
        record.riskScore
      );


    const confidence =
      record.confidence === null

        ? "--"

        : `${record.confidence.toFixed(1)}%`;


    return `

      <div class="pravaha-popup">

        <div class="pravaha-popup-title">

          ${escapeHtml(
            record.district
          )}

          ,

          ${escapeHtml(
            record.state
          )}

        </div>


        <div class="pravaha-popup-subtitle">

          ${escapeHtml(
            record.id
          )}

        </div>


        <div
          class="pravaha-popup-score"
          style="color:${color}">

          ${record.riskScore.toFixed(1)}
          /100

        </div>


        <div
          style="
            display:inline-block;
            padding:3px 7px;
            border-radius:4px;
            color:#fff;
            background:${color};
            font-size:9px;
            font-weight:800;">

          ${record.riskCategory}

        </div>


        <div
          class="pravaha-popup-grid">

          <div>

            <strong>
              Hazard
            </strong>

            <br>

            ${escapeHtml(
              record.hazard
            )}

          </div>


          <div>

            <strong>
              Predicted
            </strong>

            <br>

            ${escapeHtml(
              record.predictedHazard
            )}

          </div>


          <div>

            <strong>
              Confidence
            </strong>

            <br>

            ${confidence}

          </div>


          <div>

            <strong>
              Event
            </strong>

            <br>

            ${escapeHtml(
              record.eventType
            )}

          </div>


          <div>

            <strong>
              Latitude
            </strong>

            <br>

            ${record.lat.toFixed(5)}

          </div>


          <div>

            <strong>
              Longitude
            </strong>

            <br>

            ${record.lon.toFixed(5)}

          </div>

        </div>


        <button

          onclick="
            selectRecordById(
              '${escapeHtml(
                record.id
              ).replace(/'/g, "\\'")}'
            )
          "

          style="
            width:100%;
            margin-top:9px;
            padding:6px;
            background:#2563eb;
            color:white;
            border:none;
            border-radius:4px;
            font-size:10px;
            font-weight:700;
            cursor:pointer;">

          OPEN RECORD DETAILS

        </button>

      </div>

    `;

  }


  /* =======================================================================
     MAP LEGEND
     ======================================================================= */

  function addLegend(
    map
  ) {

    const legend =
      L.control({
        position:
          "bottomleft"
      });


    legend.onAdd =
      function () {

        const div =
          L.DomUtil.create(
            "div",
            "pravaha-legend"
          );


        div.innerHTML = `

          <div class="pravaha-legend-title">
            ML Risk Severity
          </div>


          <div class="pravaha-legend-row">

            <span
              class="pravaha-legend-dot"
              style="background:#ef4444">
            </span>

            Critical 80–100

          </div>


          <div class="pravaha-legend-row">

            <span
              class="pravaha-legend-dot"
              style="background:#f97316">
            </span>

            High 60–79

          </div>


          <div class="pravaha-legend-row">

            <span
              class="pravaha-legend-dot"
              style="background:#f59e0b">
            </span>

            Moderate 40–59

          </div>


          <div class="pravaha-legend-row">

            <span
              class="pravaha-legend-dot"
              style="background:#10b981">
            </span>

            Low 0–39

          </div>

        `;


        return div;

      };


    legend.addTo(map);

  }


  /* =======================================================================
     BASE MAPS
     ======================================================================= */

  function createBaseLayers() {

    return {

      street:

        L.tileLayer(

          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

          {

            maxZoom: 19,

            attribution:
              "&copy; OpenStreetMap contributors"

          }

        ),


      terrain:

        L.tileLayer(

          "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",

          {

            maxZoom: 17,

            attribution:
              "OpenStreetMap contributors | OpenTopoMap"

          }

        ),


      satellite:

        L.tileLayer(

          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",

          {

            maxZoom: 19,

            attribution:
              "Tiles &copy; Esri"

          }

        )

    };

  }


  /* =======================================================================
     INITIALIZE MAPS
     ======================================================================= */

  function initializeMaps() {

    if (!window.L) {

      throw new Error(
        "Leaflet failed to load."
      );

    }


    const dashboardLayers =
      createBaseLayers();


    const fullLayers =
      createBaseLayers();


    app.dashboardMap =
      L.map(
        "dashboardLeafletMap",
        {

          preferCanvas: true

        }

      ).setView(

        [
          25.8,
          93.2
        ],

        7

      );


    dashboardLayers.terrain.addTo(
      app.dashboardMap
    );


    app.fullMap =
      L.map(
        "fullLeafletMap",
        {

          preferCanvas: true

        }

      ).setView(

        [
          25.8,
          93.2
        ],

        7

      );


    fullLayers.street.addTo(
      app.fullMap
    );


    L.control.layers(

      {

        "Topographic":
          dashboardLayers.terrain,

        "Street":
          dashboardLayers.street,

        "Satellite":
          dashboardLayers.satellite

      },

      null,

      {
        collapsed:
          true
      }

    ).addTo(
      app.dashboardMap
    );


    L.control.layers(

      {

        "Street":
          fullLayers.street,

        "Topographic":
          fullLayers.terrain,

        "Satellite":
          fullLayers.satellite

      },

      null,

      {
        collapsed:
          false
      }

    ).addTo(
      app.fullMap
    );


    addLegend(
      app.dashboardMap
    );


    addLegend(
      app.fullMap
    );


    setTimeout(
      () => {

        app.dashboardMap.invalidateSize();

        app.fullMap.invalidateSize();

      },

      300

    );

  }


  /* =======================================================================
     DASHBOARD MARKERS
     ======================================================================= */

  function renderDashboardMarkers() {

    if (
      !app.dashboardMap
    ) {

      return;

    }


    if (
      app.dashboardCluster
    ) {

      app.dashboardMap.removeLayer(
        app.dashboardCluster
      );

    }


    app.dashboardCluster =
      L.markerClusterGroup({

        showCoverageOnHover:
          false,

        maxClusterRadius:
          45

      });


    app.dashboardMarkers.clear();


    const showMarkers =

      $("toggleDashboardMarkers")?.checked !== false;


    let visibleCount = 0;


    if (showMarkers) {


      const filter =
        $("dashboardRiskFilter")?.value ||
        "ALL";


      app.records.forEach(
        record => {

          if (
            filter !== "ALL" &&
            record.riskCategory !== filter
          ) {

            return;

          }


          const marker =
            L.marker(

              [
                record.lat,
                record.lon
              ],

              {
                icon:
                  createRiskIcon(
                    record.riskScore
                  )
              }

            );


          marker.bindPopup(
            buildPopup(record),
            {
              maxWidth:
                340
            }
          );


          marker.on(
            "click",
            () => {

              selectRecord(
                record
              );

              triggerGlobalAlertFlash(
                record
              );

            }
          );


          app.dashboardCluster.addLayer(
            marker
          );


          app.dashboardMarkers.set(
            record.id,
            marker
          );


          visibleCount++;

        }
      );


      app.dashboardMap.addLayer(
        app.dashboardCluster
      );

    }


    setText(
      "dashboardMapCount",
      `${visibleCount.toLocaleString()} markers`
    );


    setText(
      "footerMarkerCount",
      visibleCount.toLocaleString()
    );

  }


  /* =======================================================================
     FULL MAP MARKERS
     ======================================================================= */

  function renderFullMarkers() {

    if (
      !app.fullMap
    ) {

      return;

    }


    if (
      app.fullCluster
    ) {

      app.fullMap.removeLayer(
        app.fullCluster
      );

    }


    app.fullCluster =
      L.markerClusterGroup({

        showCoverageOnHover:
          false,

        maxClusterRadius:
          45

      });


    app.fullMarkers.clear();


    let visibleCount =
      0;


    app.records.forEach(
      record => {

        if (
          app.mapHazardFilter !== "all" &&

          record.eventType.toLowerCase() !==
            app.mapHazardFilter

        ) {

          return;

        }


        const marker =
          L.marker(

            [
              record.lat,
              record.lon
            ],

            {

              icon:
                createRiskIcon(
                  record.riskScore
                )

            }

          );


        marker.bindPopup(
          buildPopup(record),
          {
            maxWidth:
              340
          }
        );


        marker.on(
          "click",
          () => {

            selectRecord(
              record
            );

            updateGISDetail(
              record
            );

            triggerGlobalAlertFlash(
              record
            );

          }
        );


        app.fullCluster.addLayer(
          marker
        );


        app.fullMarkers.set(
          record.id,
          marker
        );


        visibleCount++;

      }
    );


    app.fullMap.addLayer(
      app.fullCluster
    );


    setText(
      "gisTotalRecords",
      app.records.length.toLocaleString()
    );


    setText(
      "gisVisibleRecords",
      visibleCount.toLocaleString()
    );


    setText(

      "gisCriticalRecords",

      app.records.filter(
        record =>
          record.riskScore >= 80
      ).length.toLocaleString()

    );


    setText(

      "gisStateCount",

      new Set(
        app.records.map(
          record => record.state
        )
      ).size.toLocaleString()

    );

  }


  /* =======================================================================
     MAP FILTER
     ======================================================================= */

  function applyDashboardMapFilters() {

    renderDashboardMarkers();

  }


  function setMapHazard(type) {

    app.mapHazardFilter =
      type;


    const buttons = [

      [
        "btnHazAll",
        "all"
      ],

      [
        "btnHazSlide",
        "slide"
      ],

      [
        "btnHazFall",
        "fall"
      ],

      [
        "btnHazFlow",
        "flow"
      ],

      [
        "btnHazOther",
        "other"
      ]

    ];


    buttons.forEach(
      ([id, key]) => {

        const button =
          $(id);


        if (!button) {
          return;
        }


        button.className =

          key === type

            ? "px-2.5 py-1 rounded font-medium bg-blue-600 text-white"

            : "px-2.5 py-1 rounded font-medium text-slate-700 hover:bg-slate-200";

      }
    );


    renderFullMarkers();

  }


  /* =======================================================================
     MAP FIT
     ======================================================================= */

  function fitDashboardMap() {

    if (
      !app.dashboardMap ||
      !app.records.length
    ) {

      return;

    }


    const filter =
      $("dashboardRiskFilter")?.value ||
      "ALL";


    const records =
      app.records.filter(
        record =>

          filter === "ALL" ||
          record.riskCategory === filter

      );


    if (!records.length) {

      return;

    }


    const bounds =
      L.latLngBounds(

        records.map(
          record =>
            [
              record.lat,
              record.lon
            ]
        )

      );


    app.dashboardMap.fitBounds(
      bounds.pad(0.08)
    );

  }


  function fitFullMap() {

    if (
      !app.fullMap ||
      !app.records.length
    ) {

      return;

    }


    const records =
      app.records.filter(
        record =>

          app.mapHazardFilter === "all" ||

          record.eventType
            .toLowerCase() ===
            app.mapHazardFilter

      );


    if (!records.length) {

      return;

    }


    const bounds =
      L.latLngBounds(

        records.map(
          record =>
            [
              record.lat,
              record.lon
            ]
        )

      );


    app.fullMap.fitBounds(
      bounds.pad(0.08)
    );

  }


  /* =======================================================================
     GIS SEARCH
     ======================================================================= */

  function searchGIS() {

    const query =
      (
        $("gisSearchInput")?.value ||
        ""
      )
      .trim()
      .toLowerCase();


    if (!query) {

      fitFullMap();

      return;

    }


    const matches =
      app.records.filter(
        record =>

          record.id
            .toLowerCase()
            .includes(query)

          ||

          record.state
            .toLowerCase()
            .includes(query)

          ||

          record.district
            .toLowerCase()
            .includes(query)

          ||

          record.hazard
            .toLowerCase()
            .includes(query)

          ||

          record.predictedHazard
            .toLowerCase()
            .includes(query)

          ||

          record.eventType
            .toLowerCase()
            .includes(query)

      );


    if (!matches.length) {

      alert(
        "No matching ML record found."
      );

      return;

    }


    const bounds =
      L.latLngBounds(

        matches.map(
          record =>
            [
              record.lat,
              record.lon
            ]
        )

      );


    app.fullMap.fitBounds(
      bounds.pad(0.15)
    );


    selectRecord(
      matches[0]
    );


    updateGISDetail(
      matches[0]
    );


    const marker =
      app.fullMarkers.get(
        matches[0].id
      );


    if (marker) {

      marker.openPopup();

    }

  }


  /* =======================================================================
     SELECT RECORD
     ======================================================================= */

  function selectRecord(
    record
  ) {

    if (!record) {

      return;

    }


    app.selectedRecord =
      record;


    setText(

      "selectedLocName",

      `${record.district}, ${record.state}`

    );


    setText(

      "selectedDistrictTag",

      `${record.state} • ${record.district}`

    );


    setText(

      "selectedLocCoords",

      `Lat: ${record.lat.toFixed(5)}°, Lon: ${record.lon.toFixed(5)}°`

    );


    /* ========================================================
       RISK BADGE
       ======================================================== */

    const badge =
      $("selectedLocRiskBadge");


    if (badge) {

      const color =
        getRiskColor(
          record.riskScore
        );


      badge.textContent =

        `${record.riskCategory} (${record.riskScore.toFixed(1)}/100)`;


      badge.style.color =
        color;


      badge.style.background =
        `${color}18`;


      badge.style.border =
        `1px solid ${color}55`;

    }


    setText(
      "selectedLocHazard",
      record.hazard
    );


    setText(
      "selectedLocPredHazard",
      record.predictedHazard
    );


    setText(

      "selectedLocConfidence",

      record.confidence === null

        ? `${record.riskScore.toFixed(1)}%`

        : `${record.confidence.toFixed(1)}%`

    );


    setText(
      "selectedLocEventType",
      record.eventType
    );


    setText(

      "selectedLocAiReason",

      buildAIReason(
        record
      )

    );


    setText(

      "selectedLocOperationalNote",

      `Source record: ${record.id}. ` +

      `Displayed fields come from the ML/API response. ` +

      `Rainfall, soil moisture, slope and InSAR values are not fabricated.`

    );


    updateGISDetail(
      record
    );


    updateAnalysisFromRecord(
      record
    );

  }


  function selectRecordById(
    id
  ) {

    const record =
      app.records.find(
        item =>
          item.id === String(id)
      );


    if (!record) {

      return;

    }


    selectRecord(
      record
    );

    switchTab(
      "risk-analysis"
    );

  }


  /* =======================================================================
     AI EXPLANATION
     ======================================================================= */

  function buildAIReason(
    record
  ) {

    const confidenceText =

      record.confidence === null

        ? `a risk score of ${record.riskScore.toFixed(1)}/100`

        : `a model confidence of ${record.confidence.toFixed(1)}%`;


    return (

      `This ${record.riskCategory.toLowerCase()}-priority prediction ` +

      `is located in ${record.district}, ${record.state}. ` +

      `The observed hazard is "${record.hazard}" and the predicted hazard ` +

      `is "${record.predictedHazard}" with ${confidenceText}. ` +

      `The recorded event type is "${record.eventType}".`

    );

  }


  /* =======================================================================
     GIS DETAIL PANEL
     ======================================================================= */

  function updateGISDetail(
    record
  ) {

    if (!record) {
      return;
    }


    setText(

      "gisNodeName",

      `${record.district}, ${record.state}`

    );


    setText(
      "gisNodeBadge",
      record.riskCategory
    );


    setText(

      "gisNodeDesc",

      `${record.id} • ${record.lat.toFixed(5)}, ${record.lon.toFixed(5)}`

    );


    setText(

      "gisNodeScore",

      record.confidence === null

        ? record.riskScore.toFixed(1)

        : `${record.confidence.toFixed(1)}%`

    );


    setText(
      "gisNodeHazard",
      record.hazard
    );


    setText(
      "gisNodePred",
      record.predictedHazard
    );


    setText(
      "gisNodeEvent",
      record.eventType
    );

  }


  /* =======================================================================
     METRICS
     ======================================================================= */

  function updateMetrics() {

    const records =
      app.records;


    const total =
      records.length;


    const average =
      total

        ? records.reduce(
            (sum, record) =>
              sum +
              record.riskScore,

            0
          ) / total

        : 0;


    const critical =
      records.filter(
        record =>
          record.riskScore >= 80
      );


    const high =
      records.filter(
        record =>

          record.riskScore >= 60 &&
          record.riskScore < 80

      );


    const moderatePlus =
      records.filter(
        record =>
          record.riskScore >= 40
      );


    const corridorGroups =
      new Set(

        moderatePlus.map(
          record =>
            `${record.state}||${record.district}`
        )

      );


    setText(

      "liveTotalPredictions",

      total.toLocaleString()

    );


    setText(

      "liveRegionalRiskScore",

      average.toFixed(1)

    );


    setText(

      "liveRegionalRiskLevel",

      getRiskCategory(
        average
      )

    );


    setText(

      "liveCriticalZones",

      critical.length.toLocaleString()

    );


    setText(

      "liveHighZones",

      high.length.toLocaleString()

    );


    setText(

      "liveAlertCount",

      moderatePlus.length.toLocaleString()

    );


    setText(

      "liveCriticalAlertCount",

      critical.length.toLocaleString()

    );


    setText(

      "liveCorridorsAtRisk",

      corridorGroups.size.toLocaleString()

    );


    setText(

      "sidebarAlertCount",

      critical.length.toLocaleString()

    );


    setText(

      "footerPredictionCount",

      total.toLocaleString()

    );


    if (app.apiConnected) {

      setApiStatus(

        `API connected • ${total.toLocaleString()} valid ML records • ` +

        `${new Set(records.map(r => r.state)).size} states • ` +

        `Endpoint: ${app.apiEndpoint}`,

        "ok"

      );

    }

  }


  /* =======================================================================
     DASHBOARD TABLE
     ======================================================================= */

  function renderDashboardTable() {

    const tbody =
      $("dashboardVulnerableTable");


    if (!tbody) {

      return;

    }


    const records =
      [...app.records]

        .sort(
          (a, b) =>
            b.riskScore -
            a.riskScore
        )

        .slice(0, 25);


    tbody.innerHTML =
      "";


    records.forEach(
      record => {

        const tr =
          document.createElement(
            "tr"
          );


        tr.className =
          "hover:bg-slate-50 cursor-pointer";


        const color =
          getRiskColor(
            record.riskScore
          );


        tr.innerHTML = `

          <td class="p-2.5 font-semibold">
            ${escapeHtml(record.state)}
          </td>

          <td class="p-2.5">
            ${escapeHtml(record.district)}
          </td>

          <td class="p-2.5 font-mono text-[10px]">
            ${record.lat.toFixed(4)},
            ${record.lon.toFixed(4)}
          </td>

          <td class="p-2.5">
            ${escapeHtml(record.hazard)}
          </td>

          <td class="p-2.5">
            ${escapeHtml(record.predictedHazard)}
          </td>

          <td
            class="p-2.5 text-center font-bold"
            style="color:${color}">

            ${
              record.confidence === null

                ? record.riskScore.toFixed(1)

                : record.confidence.toFixed(1)

            }%

          </td>

          <td class="p-2.5 text-center">

            <span
              style="
                color:${color};
                background:${color}18"
              class="px-1.5 py-0.5 rounded text-[10px] font-bold">

              ${escapeHtml(
                record.eventType
              )}

            </span>

          </td>

        `;


        tr.onclick = () =>
          selectRecord(
            record
          );


        tbody.appendChild(
          tr
        );

      }
    );


    setText(

      "dashboardTableInfo",

      `${Math.min(
        25,
        records.length
      ).toLocaleString()} of ${app.records.length.toLocaleString()} records`

    );

  }


  /* =======================================================================
     ALERTS
     ======================================================================= */

  function buildAlerts() {

    return [...app.records]

      .filter(
        record =>
          record.riskScore >= 40
      )

      .sort(
        (a, b) =>
          b.riskScore -
          a.riskScore
      );

  }


  function renderMiniAlerts() {

    const container =
      $("dashboardMiniAlerts");


    if (!container) {

      return;

    }


    const records =
      buildAlerts()
        .slice(0, 8);


    container.innerHTML =
      "";


    if (!records.length) {

      container.innerHTML =

        `<div class="text-[11px] text-slate-400">
          No records above alert threshold.
        </div>`;

      setText(
        "dashboardMiniAlertCount",
        "0"
      );

      return;

    }


    records.forEach(
      record => {

        const color =
          getRiskColor(
            record.riskScore
          );


        const button =
          document.createElement(
            "button"
          );


        button.className =

          "w-full text-left p-2 rounded " +

          "bg-slate-50 border border-slate-200 " +

          "hover:border-slate-300";


        button.innerHTML = `

          <div class="flex items-center justify-between">

            <span
              class="text-[11px] font-bold truncate max-w-[185px]">

              ${escapeHtml(
                record.district
              )}

              ,

              ${escapeHtml(
                record.state
              )}

            </span>

            <span
              class="text-[9px] font-bold"
              style="color:${color}">

              ${record.riskScore.toFixed(1)}

            </span>

          </div>


          <div
            class="text-[10px] text-slate-500 mt-0.5">

            ${escapeHtml(
              record.predictedHazard
            )}

            •

            ${escapeHtml(
              record.eventType
            )}

          </div>

        `;


        button.onclick = () =>
          selectRecord(
            record
          );


        container.appendChild(
          button
        );

      }
    );


    setText(

      "dashboardMiniAlertCount",

      records.length.toLocaleString()

    );

  }


  function filterAlerts(
    filter = "ALL"
  ) {

    const container =
      $("alertsFullList");


    if (!container) {

      return;

    }


    let records =
      buildAlerts();


    if (filter !== "ALL") {

      records =
        records.filter(
          record =>
            record.riskCategory ===
            filter
        );

    }


    container.innerHTML =
      "";


    if (!records.length) {

      container.innerHTML =

        `<div class="bg-white border border-slate-200 rounded-md p-4 text-xs text-slate-500">
          No matching alerts.
        </div>`;

      return;

    }


    records
      .slice(0, 100)
      .forEach(
        record => {

          const color =
            getRiskColor(
              record.riskScore
            );


          const card =
            document.createElement(
              "div"
            );


          card.className =
            "bg-white rounded-md border " +
            "border-slate-200 p-3.5 shadow-sm";


          card.style.borderLeft =
            `4px solid ${color}`;


          card.innerHTML = `

            <div
              class="flex flex-wrap items-center justify-between gap-2">

              <div>

                <span
                  style="
                    background:${color}18;
                    color:${color}"
                  class="px-2 py-0.5 rounded text-xs font-bold">

                  ${record.riskCategory}

                </span>

                <span
                  class="font-bold text-sm ml-2">

                  ${escapeHtml(
                    record.district
                  )}

                  ,

                  ${escapeHtml(
                    record.state
                  )}

                </span>

              </div>

              <span
                class="font-mono text-xs"
                style="color:${color}">

                ${record.riskScore.toFixed(1)}/100

              </span>

            </div>


            <div
              class="text-xs text-slate-700 mt-2">

              <strong>
                Record:
              </strong>

              ${escapeHtml(
                record.id
              )}

              |

              <strong>
                Hazard:
              </strong>

              ${escapeHtml(
                record.hazard
              )}

              |

              <strong>
                Predicted:
              </strong>

              ${escapeHtml(
                record.predictedHazard
              )}

              |

              <strong>
                Event:
              </strong>

              ${escapeHtml(
                record.eventType
              )}

            </div>


            <div
              class="text-[11px] text-slate-500 mt-1">

              Confidence:

              ${
                record.confidence === null
                  ? "--"
                  : record.confidence.toFixed(1) + "%"
              }

              •

              Coordinates:

              ${record.lat.toFixed(5)},
              ${record.lon.toFixed(5)}

            </div>


            <div
              class="bg-slate-50 p-2 rounded border border-slate-200 text-xs text-slate-700 mt-2">

              ${escapeHtml(
                buildAIReason(
                  record
                )
              )}

            </div>

          `;


          container.appendChild(
            card
          );

        }
      );

  }


  /* =======================================================================
     VULNERABILITY GROUPS
     ======================================================================= */

  function renderVulnerableGroups() {

    const tbody =
      $("vulnerableFullTable");


    if (!tbody) {

      return;

    }


    const groups =
      new Map();


    app.records.forEach(
      record => {

        const key =
          `${record.state}||${record.district}`;


        if (!groups.has(key)) {

          groups.set(
            key,
            []
          );

        }


        groups
          .get(key)
          .push(record);

      }
    );


    const result =
      [...groups.entries()]

        .map(
          ([key, records]) => {

            const average =

              records.reduce(
                (sum, record) =>
                  sum +
                  record.riskScore,

                0
              ) /
              records.length;


            const critical =
              records.filter(
                record =>
                  record.riskScore >= 80
              ).length;


            const high =
              records.filter(
                record =>
                  record.riskScore >= 60 &&
                  record.riskScore < 80
              ).length;


            const events = {};


            records.forEach(
              record => {

                events[
                  record.eventType
                ] =

                  (
                    events[
                      record.eventType
                    ] ||
                    0
                  ) + 1;

              }
            );


            const dominant =
              Object.entries(
                events
              )
              .sort(
                (a, b) =>
                  b[1] -
                  a[1]
              )[0]?.[0] ||
              "Other";


            const [
              stateName,
              districtName
            ] = key.split("||");


            return {

              state:
                stateName,

              district:
                districtName,

              count:
                records.length,

              average:
                average,

              critical:
                critical,

              high:
                high,

              dominant:
                dominant

            };

          }
        )

        .filter(
          item =>
            item.average >= 40
        )

        .sort(
          (a, b) =>
            b.average -
            a.average
        );


    tbody.innerHTML =
      "";


    result.forEach(
      row => {

        const tr =
          document.createElement(
            "tr"
          );


        tr.className =
          "hover:bg-slate-50";


        tr.innerHTML = `

          <td class="p-3 font-semibold">
            ${escapeHtml(
              row.state
            )}
          </td>

          <td class="p-3">
            ${escapeHtml(
              row.district
            )}
          </td>

          <td class="p-3 text-center">
            ${row.count}
          </td>

          <td class="p-3 text-center font-bold text-red-600">
            ${row.critical}
          </td>

          <td class="p-3 text-center font-bold text-orange-600">
            ${row.high}
          </td>

          <td class="p-3 text-center font-mono">
            ${row.average.toFixed(1)}
          </td>

          <td class="p-3">
            ${escapeHtml(
              row.dominant
            )}
          </td>

        `;


        tbody.appendChild(
          tr
        );

      }
    );

  }


  /* =======================================================================
     ANALYSIS
     ======================================================================= */

  /* =======================================================================
     RISK ANALYSIS PANEL

     The three selectors cascade State -> District -> Record. Every rebuild
     preserves the user's current choice where it is still valid, so a
     background auto-refresh never snaps the panel back to the first record,
     and the Record selector actually drives the diagnostic.
     ======================================================================= */

  const analysisSelection = {

    recordId: null

  };


  /* Guards the two-way sync between the selectors and the globally
     selected record, so neither side can re-enter the other. */

  let analysisSyncing = false;

  let analysisForceRecord = null;


  function analysisSyncToRecord(record) {

    if (
      analysisSyncing ||
      !record
    ) {
      return;
    }

    const locationSelect = $("analysisLocation");

    if (
      !locationSelect ||
      locationSelect.value === record.id
    ) {
      return;
    }

    analysisSyncing = true;

    analysisForceRecord = record;

    try {

      updateAnalysisSelectors();

    } finally {

      analysisSyncing = false;

      analysisForceRecord = null;

    }

  }


  function analysisPickValue(current, options, fallback) {

    if (
      current &&
      options.includes(current)
    ) {
      return current;
    }

    if (
      fallback &&
      options.includes(fallback)
    ) {
      return fallback;
    }

    return options[0] ?? "";

  }


  function analysisFillSelect(select, options, chosen) {

    select.innerHTML =
      options.map(
        option =>
          `<option value="${escapeHtml(option.value)}"${
            option.value === chosen ? " selected" : ""
          }>${escapeHtml(option.label)}</option>`
      ).join("");

    select.value = chosen ?? "";

  }


  /* Record the panel should fall back to when the current choice is gone */

  function analysisTargetRecord() {

    if (analysisSelection.recordId) {

      const remembered =
        app.records.find(
          record =>
            record.id === analysisSelection.recordId
        );

      if (remembered) {
        return remembered;
      }

    }

    if (app.selectedRecord) {
      return app.selectedRecord;
    }

    return (
      [...app.records].sort(
        (a, b) =>
          (b.riskScore || 0) - (a.riskScore || 0)
      )[0] || null
    );

  }


  function analysisScoreText(record) {

    return Number.isFinite(record?.riskScore)
      ? record.riskScore.toFixed(1)
      : "--";

  }


  function clearAnalysisPanel(message) {

    setText("anaRiskScore", "--");

    const category = $("anaRiskCategory");

    if (category) {

      category.textContent = "NO DATA";

      category.style.color = "#64748b";

    }

    [
      "anaConfidence",
      "anaHazard",
      "anaPredHazard",
      "anaEvent",
      "anaState",
      "anaDistrict",
      "anaCoords"
    ].forEach(
      id => setText(id, "--")
    );

    setText(
      "anaAiReason",
      message || "No record is available for the current selection."
    );

    destroyChart("gauge");

  }


  function updateAnalysisSelectors() {

    const stateSelect = $("analysisState");

    if (!stateSelect) {
      return;
    }

    const states =
      [
        ...new Set(
          app.records.map(record => record.state)
        )
      ].sort();

    if (!states.length) {

      stateSelect.innerHTML = "";

      const districtSelect = $("analysisDistrict");

      const locationSelect = $("analysisLocation");

      if (districtSelect) {
        districtSelect.innerHTML = "";
      }

      if (locationSelect) {
        locationSelect.innerHTML = "";
      }

      clearAnalysisPanel(
        "No ML records are loaded, so no diagnostic can be produced."
      );

      return;

    }

    const target = analysisTargetRecord();

    const chosen =
      analysisPickValue(
        analysisForceRecord
          ? analysisForceRecord.state
          : stateSelect.value,
        states,
        target?.state
      );

    analysisFillSelect(
      stateSelect,
      states.map(
        state => ({ value: state, label: state })
      ),
      chosen
    );

    updateAnalysisLocations();

  }


  function updateAnalysisLocations() {

    const stateName = $("analysisState")?.value;

    const districtSelect = $("analysisDistrict");

    if (!districtSelect) {
      return;
    }

    const districts =
      [
        ...new Set(
          app.records
            .filter(record => record.state === stateName)
            .map(record => record.district)
        )
      ].sort();

    if (!districts.length) {

      districtSelect.innerHTML = "";

      const locationSelect = $("analysisLocation");

      if (locationSelect) {
        locationSelect.innerHTML = "";
      }

      clearAnalysisPanel(
        `No records are available for ${stateName || "the selected state"}.`
      );

      return;

    }

    const target = analysisTargetRecord();

    const chosen =
      analysisPickValue(
        analysisForceRecord
          ? analysisForceRecord.district
          : districtSelect.value,
        districts,
        target?.state === stateName
          ? target?.district
          : null
      );

    analysisFillSelect(
      districtSelect,
      districts.map(
        district => ({ value: district, label: district })
      ),
      chosen
    );

    updateAnalysisData();

  }


  function updateAnalysisData() {

    const stateName = $("analysisState")?.value;

    const districtName = $("analysisDistrict")?.value;

    const locationSelect = $("analysisLocation");

    if (!locationSelect) {
      return;
    }

    const records =
      app.records
        .filter(
          record =>
            record.state === stateName &&
            record.district === districtName
        )
        .sort(
          (a, b) =>
            (b.riskScore || 0) - (a.riskScore || 0)
        );

    if (!records.length) {

      locationSelect.innerHTML = "";

      clearAnalysisPanel(
        `No records are available for ${districtName || "the selected district"}.`
      );

      return;

    }

    const target = analysisTargetRecord();

    const ids = records.map(record => record.id);

    const chosenId =
      analysisPickValue(
        analysisForceRecord
          ? analysisForceRecord.id
          : locationSelect.value,
        ids,
        ids.includes(target?.id) ? target.id : null
      );

    analysisFillSelect(
      locationSelect,
      records.map(
        record => ({
          value: record.id,
          label:
            `${record.id} — ${record.eventType} — ` +
            `${analysisScoreText(record)} (${record.riskCategory})`
        })
      ),
      chosenId
    );

    const chosen =
      records.find(record => record.id === chosenId) ||
      records[0];

    analysisSelection.recordId = chosen.id;

    /* Keep the rest of the platform in sync with the analysed record.
       selectRecord() calls back into updateAnalysisFromRecord(), so it is
       only used when the record carries usable coordinates. */

    if (analysisSyncing) {

      updateAnalysisFromRecord(chosen);

    } else if (
      Number.isFinite(chosen.lat) &&
      Number.isFinite(chosen.lon)
    ) {

      selectRecord(chosen);

    } else {

      app.selectedRecord = chosen;

      updateAnalysisFromRecord(chosen);

    }

  }


  /* -----------------------------------------------------------------------
     Diagnostic narrative for the analysis panel: adds district and state
     context that the shorter GIS popup explanation does not carry.
     ----------------------------------------------------------------------- */

  function buildAnalysisNarrative(record) {

    const parts = [
      buildAIReason(record)
    ];

    const districtRecords =
      app.records.filter(
        item =>
          item.state === record.state &&
          item.district === record.district
      );

    if (districtRecords.length > 1) {

      const sorted =
        [...districtRecords].sort(
          (a, b) =>
            (b.riskScore || 0) - (a.riskScore || 0)
        );

      const rank =
        sorted.findIndex(item => item.id === record.id) + 1;

      const mean =
        districtRecords.reduce(
          (sum, item) => sum + (item.riskScore || 0),
          0
        ) / districtRecords.length;

      const critical =
        districtRecords.filter(
          item => (item.riskScore || 0) >= 80
        ).length;

      parts.push(
        `Within ${record.district} it ranks ${rank} of ${districtRecords.length} inventoried records ` +
        `(district mean ${mean.toFixed(1)}/100, ${critical} record${critical === 1 ? "" : "s"} in the critical band).`
      );

    }

    const agrees =
      String(record.hazard).trim().toLowerCase() ===
      String(record.predictedHazard).trim().toLowerCase();

    parts.push(
      agrees
        ? "The ensemble reproduces the inventoried material class, so the susceptibility estimate carries normal weight."
        : "The ensemble disagrees with the inventoried material class, so field verification is advised before this record drives a closure decision."
    );

    if (Number.isFinite(record.confidence) && record.confidence < 60) {

      parts.push(
        "Model confidence is below 60%, which places this record in the low-certainty tier."
      );

    }

    return parts.join(" ");

  }


  function updateAnalysisFromRecord(record) {

    if (!record) {

      clearAnalysisPanel();

      return;

    }

    setText(
      "anaRiskScore",
      analysisScoreText(record)
    );

    setText(
      "anaRiskCategory",
      `${record.riskCategory} RISK ZONE`
    );

    const category = $("anaRiskCategory");

    if (category) {

      category.style.color =
        getRiskColor(record.riskScore || 0);

    }

    const score = $("anaRiskScore");

    if (score) {

      score.style.color =
        getRiskColor(record.riskScore || 0);

    }

    setText(
      "anaConfidence",
      Number.isFinite(record.confidence)
        ? `${record.confidence.toFixed(1)}%`
        : `${analysisScoreText(record)}% (derived)`
    );

    setText("anaHazard", record.hazard);

    setText("anaPredHazard", record.predictedHazard);

    setText("anaEvent", record.eventType);

    setText(
      "anaAiReason",
      buildAnalysisNarrative(record)
    );

    setText("anaState", record.state);

    setText("anaDistrict", record.district);

    setText(
      "anaCoords",
      Number.isFinite(record.lat) && Number.isFinite(record.lon)
        ? `${record.lat.toFixed(5)}, ${record.lon.toFixed(5)}`
        : "Not geolocated"
    );

    createGaugeChart(
      Number.isFinite(record.riskScore)
        ? record.riskScore
        : 0
    );

    analysisSelection.recordId = record.id;

    analysisSyncToRecord(record);

  }


  /* =======================================================================
     CHARTS
     IMPORTANT:
     destroy previous instances before creating a new Chart object.
     ======================================================================= */

  function destroyChart(
    name
  ) {

    const chart =
      app.charts[name];


    if (chart) {

      try {

        chart.destroy();

      } catch (error) {

        console.warn(
          "[PRAVAHA] Chart destroy error:",
          error
        );

      }

    }


    app.charts[name] =
      null;

  }


  function createTrendChart() {

    destroyChart(
      "trend"
    );


    const canvas =
      $("dashboardTrendChart");


    if (
      !canvas ||
      !window.Chart
    ) {

      return;

    }


    const categories = [

      "LOW",
      "MODERATE",
      "HIGH",
      "CRITICAL"

    ];


    const values =
      categories.map(
        category =>

          app.records.filter(
            record =>
              record.riskCategory ===
              category
          ).length

      );


    app.charts.trend =

      new Chart(

        canvas,

        {

          type: "bar",

          data: {

            labels:
              categories,

            datasets: [

              {

                label:
                  "ML Records",

                data:
                  values,

                backgroundColor: [

                  "#10b981",
                  "#f59e0b",
                  "#f97316",
                  "#ef4444"

                ],

                borderWidth:
                  0,

                borderRadius:
                  5

              }

            ]

          },

          options: {

            responsive:
              true,

            maintainAspectRatio:
              false,

            plugins: {

              legend: {

                display:
                  false

              }

            },

            scales: {

              x: {

                grid: {
                  display:
                    false
                },

                ticks: {
                  font: {
                    size:
                      10
                  }
                }

              },

              y: {

                beginAtZero:
                  true,

                grid: {

                  color:
                    "#e2e8f0"

                },

                ticks: {

                  font: {
                    size:
                      10
                  }

                }

              }

            }

          }

        }

      );

  }


  function createGaugeChart(
    score
  ) {

    destroyChart(
      "gauge"
    );


    const canvas =
      $("anaGaugeChart");


    if (
      !canvas ||
      !window.Chart
    ) {

      return;

    }


    app.charts.gauge =

      new Chart(

        canvas,

        {

          type:
            "doughnut",

          data: {

            datasets: [

              {

                data: [

                  score,

                  Math.max(
                    0,
                    100 - score
                  )

                ],

                backgroundColor: [

                  getRiskColor(
                    score
                  ),

                  "#e2e8f0"

                ],

                borderWidth:
                  0

              }

            ]

          },

          options: {

            cutout:
              "74%",

            responsive:
              true,

            maintainAspectRatio:
              false,

            plugins: {

              tooltip: {
                enabled:
                  false
              },

              legend: {
                display:
                  false
              }

            }

          }

        }

      );

  }


  function refreshCharts() {

    createTrendChart();


    if (
      app.selectedRecord
    ) {

      createGaugeChart(

        app.selectedRecord.riskScore

      );

    }


    setText(

      "chartDataNote",

      `Distribution of ${app.records.length.toLocaleString()} ML records`

    );

  }


  /* =======================================================================
     TAB SWITCHING
     ======================================================================= */

  function switchTab(
    tabId
  ) {

    const tabs = [

      "dashboard",
      "risk-analysis",
      "risk-map",
      "forecast",
      "alerts",
      "vulnerable-zones",
      "feedback"

    ];


    tabs.forEach(
      tab => {

        const view =
          $(`view-${tab}`);


        if (view) {

          view.classList.add(
            "hidden"
          );

        }


        const nav =
          $(`nav-${tab}`);


        if (nav) {

          nav.classList.remove(

            "bg-blue-600/90",
            "text-white",
            "shadow-sm"

          );

          nav.classList.add(
            "text-slate-300"
          );

        }

      }
    );


    const selectedView =
      $(`view-${tabId}`);


    if (selectedView) {

      selectedView.classList.remove(
        "hidden"
      );

    }


    const activeNav =
      $(`nav-${tabId}`);


    if (activeNav) {

      activeNav.classList.add(

        "bg-blue-600/90",
        "text-white",
        "shadow-sm"

      );

      activeNav.classList.remove(
        "text-slate-300"
      );

    }


    if (
      tabId ===
      "dashboard"
    ) {

      setTimeout(
        () => {

          app.dashboardMap
            ?.invalidateSize();

          renderDashboardMarkers();

        },

        150

      );

    }


    if (
      tabId ===
      "risk-map"
    ) {

      setTimeout(
        () => {

          app.fullMap
            ?.invalidateSize();

          renderFullMarkers();

        },

        150

      );

    }


    if (
      tabId ===
      "risk-analysis"
    ) {

      updateAnalysisSelectors();

    }


    if (
      tabId ===
      "alerts"
    ) {

      filterAlerts(
        "ALL"
      );

    }


    if (
      tabId ===
      "vulnerable-zones"
    ) {

      renderVulnerableGroups();

    }


    if (
      tabId ===
      "forecast"
    ) {

      if (
        forecastState.loaded &&
        !forecastState.loading
      ) {

        renderForecast();

      } else {

        loadForecast();

      }

    }


    if (
      tabId ===
      "feedback"
    ) {

      renderFeedback();

    }


    if (window.lucide) {

      lucide.createIcons();

    }

  }


  /* =======================================================================
     CLOCK
     ======================================================================= */

  function startClock() {

    function update() {

      const time =
        new Date().toLocaleTimeString(

          "en-IN",

          {

            hour12:
              false,

            timeZone:
              "Asia/Kolkata"

          }

        );


      setText(
        "clock",
        `${time} IST`
      );

    }


    update();


    setInterval(
      update,
      1000
    );

  }


  /* =======================================================================
     COMPLETE UI REFRESH
     ======================================================================= */

  function updateAllUI() {

    updateMetrics();

    renderDashboardMarkers();

    renderFullMarkers();

    renderDashboardTable();

    renderMiniAlerts();

    renderVulnerableGroups();

    filterAlerts(
      "ALL"
    );

    updateAnalysisSelectors();

    refreshCharts();


    setTimeout(
      () => {

        app.dashboardMap
          ?.invalidateSize();

        app.fullMap
          ?.invalidateSize();

      },

      250

    );


    if (window.lucide) {

      lucide.createIcons();

    }


    if (
      !app.selectedRecord &&
      app.records.length
    ) {

      const highest =
        [...app.records].sort(

          (a, b) =>
            b.riskScore -
            a.riskScore

        )[0];


      selectRecord(
        highest
      );

    }

  }


  /* =======================================================================
     MAIN DATA REFRESH
     ======================================================================= */

  async function refreshAllData() {

    setApiStatus(

      "Connecting to prediction API…",

      "loading"

    );


    try {

      const records =
        await loadPredictionData();


      app.records =
        records;


      app.apiConnected =
        true;


      app.lastUpdated =
        new Date();


      updateAllUI();


      if (!records.length) {

        setApiStatus(

          "API connected but returned no valid geospatial ML records.",

          "error"

        );

      }

    } catch (error) {

      console.error(
        "[PRAVAHA] API error:",
        error
      );


      app.records =
        demoRecords();


      app.apiConnected =
        false;


      app.lastUpdated =
        new Date();


      updateAllUI();


      setApiStatus(

        `API unavailable — DEMO MODE. ${error.message || ""}`.trim(),

        "error"

      );

    }

  }


  /* =======================================================================
     AUTOMATIC REFRESH
     ======================================================================= */

  function startAutoRefresh() {

    clearInterval(
      app.refreshTimer
    );


    app.refreshTimer =
      setInterval(

        refreshAllData,

        AUTO_REFRESH_MS

      );

  }


  /* =======================================================================
     API CONFIGURATION
     ======================================================================= */

  function showApiConfig() {

    const value =
      prompt(

        `PRAVAHA API Base URL\n\nCurrent:\n${API_BASE_URL}\n\nEnter new base URL:`,

        API_BASE_URL

      );


    if (!value) {

      return;

    }


    const cleaned =
      value
        .trim()
        .replace(
          /\/+$/,
          ""
        );


    localStorage.setItem(

      "PRAVAHA_API_BASE_URL",

      cleaned

    );


    alert(

      `Saved API URL:\n${cleaned}\n\nClick "Refresh API Data".`

    );

  }


  /* =======================================================================
     ALERT SUMMARY
     ======================================================================= */

  function toggleGlobalAlertModal() {

    const critical =
      app.records.filter(
        record =>
          record.riskScore >= 80
      ).length;


    const high =
      app.records.filter(

        record =>

          record.riskScore >= 60 &&
          record.riskScore < 80

      ).length;


    alert(

      `PRAVAHA ML STATUS\n\n` +

      `Records: ${app.records.length}\n` +

      `Critical: ${critical}\n` +

      `High: ${high}\n` +

      `API: ${app.apiConnected ? "CONNECTED" : "DEMO MODE"}\n\n` +

      `Last update: ${app.lastUpdated?.toLocaleString() || "--"}`

    );

  }


  /* =======================================================================
     72-HOUR HYDRO-METEOROLOGICAL FORECAST ENGINE

     Couples the ML susceptibility score already loaded from the PRAVAHA
     backend with a live hourly meteorological forecast (Open-Meteo) to
     produce an hour-by-hour landslide triggering index.

       risk(t) = 0.40 * ML_susceptibility
               + 0.60 * trigger(t)

       trigger(t) = 0.45 * f(rolling 24h rainfall)
                  + 0.30 * f(antecedent precipitation index)
                  + 0.25 * f(near-surface soil moisture)

     Nothing is fabricated: if the meteorological service is unreachable the
     panel reports the failure instead of substituting synthetic rainfall.
     ======================================================================= */

  const FORECAST_API_URL =
    "https://api.open-meteo.com/v1/forecast";

  const FORECAST_MAX_DISTRICTS = 10;

  const FORECAST_HOURS = 72;

  /* 0.84 per day expressed per hour: 0.84 ^ (1/24) */
  const FORECAST_API_DECAY = 0.9928;

  const FORECAST_WEIGHT_BASE = 0.40;

  const FORECAST_WEIGHT_TRIGGER = 0.60;

  const forecastState = {

    loading: false,

    loaded: false,

    error: null,

    generatedAt: null,

    districts: [],

    selectedKey: null,

    signature: null

  };

  app.charts.forecast = null;


  function forecastClamp(value, min, max) {

    return Math.max(min, Math.min(max, value));

  }


  function forecastNorm(value, min, max) {

    if (!Number.isFinite(value)) {
      return 0;
    }

    return forecastClamp(
      (value - min) / (max - min),
      0,
      1
    );

  }


  function forecastRound(value, digits = 1) {

    if (!Number.isFinite(value)) {
      return "--";
    }

    return value.toFixed(digits);

  }


  /* -----------------------------------------------------------------------
     Current hour in IST, as a comparable ISO prefix "YYYY-MM-DDTHH"
     ----------------------------------------------------------------------- */

  function forecastNowStamp() {

    const parts =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          hour12: false
        }
      ).formatToParts(new Date());

    const pick =
      type =>
        parts.find(part => part.type === type)?.value ?? "00";

    let hour = pick("hour");

    if (hour === "24") {
      hour = "00";
    }

    return `${pick("year")}-${pick("month")}-${pick("day")}T${hour}`;

  }


  const FORECAST_MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];


  function forecastLabel(isoLocal, withDate = true) {

    const text = String(isoLocal || "");

    const day = text.slice(8, 10);

    const monthIndex = Number(text.slice(5, 7)) - 1;

    const time = text.slice(11, 16);

    if (!time) {
      return text;
    }

    if (!withDate) {
      return time;
    }

    return `${day} ${FORECAST_MONTHS[monthIndex] || ""} ${time}`;

  }


  /* -----------------------------------------------------------------------
     Aggregate ML records into candidate districts
     ----------------------------------------------------------------------- */

  function forecastCandidates() {

    const groups = new Map();

    app.records.forEach(
      record => {

        if (
          !Number.isFinite(record.lat) ||
          !Number.isFinite(record.lon)
        ) {
          return;
        }

        const key =
          `${record.state}|${record.district}`;

        let group = groups.get(key);

        if (!group) {

          group = {
            key: key,
            state: record.state,
            district: record.district,
            latSum: 0,
            lonSum: 0,
            count: 0,
            riskSum: 0,
            maxRisk: 0,
            events: new Map()
          };

          groups.set(key, group);

        }

        const score =
          Number.isFinite(record.riskScore)
            ? record.riskScore
            : 0;

        group.latSum += record.lat;
        group.lonSum += record.lon;
        group.count += 1;
        group.riskSum += score;

        if (score > group.maxRisk) {
          group.maxRisk = score;
        }

        const event =
          record.eventType || "Other";

        group.events.set(
          event,
          (group.events.get(event) || 0) + 1
        );

      }
    );

    return [...groups.values()]
      .map(
        group => ({

          key: group.key,

          state: group.state,

          district: group.district,

          lat: group.latSum / group.count,

          lon: group.lonSum / group.count,

          sites: group.count,

          baseRisk:
            forecastClamp(
              0.65 * group.maxRisk +
              0.35 * (group.riskSum / group.count),
              0,
              100
            ),

          dominantEvent:
            [...group.events.entries()]
              .sort((a, b) => b[1] - a[1])[0]?.[0] || "Other"

        })
      )
      .sort(
        (a, b) =>
          b.baseRisk - a.baseRisk ||
          b.sites - a.sites
      )
      .slice(0, FORECAST_MAX_DISTRICTS);

  }


  function forecastSignature(candidates) {

    return `${app.records.length}::${candidates.map(item => item.key).join("|")}`;

  }


  /* -----------------------------------------------------------------------
     Meteorological fetch (multi-location, single request)
     ----------------------------------------------------------------------- */

  async function forecastFetchWeather(points) {

    const params =
      new URLSearchParams({

        latitude:
          points.map(point => point.lat.toFixed(4)).join(","),

        longitude:
          points.map(point => point.lon.toFixed(4)).join(","),

        hourly:
          "precipitation,precipitation_probability,soil_moisture_0_to_7cm,temperature_2m,relative_humidity_2m",

        past_days: "3",

        forecast_days: "4",

        timezone: "Asia/Kolkata"

      });

    const response =
      await fetch(
        `${FORECAST_API_URL}?${params.toString()}`,
        { cache: "no-store" }
      );

    if (!response.ok) {

      throw new Error(
        `Meteorological service responded with HTTP ${response.status}`
      );

    }

    const payload =
      await response.json();

    const blocks =
      Array.isArray(payload)
        ? payload
        : [payload];

    if (blocks.length !== points.length) {

      throw new Error(
        "Meteorological service returned an unexpected number of locations"
      );

    }

    return blocks;

  }


  /* -----------------------------------------------------------------------
     Triggering model for one district
     ----------------------------------------------------------------------- */

  function forecastCompute(meta, block) {

    const hourly = block?.hourly || {};

    const times = hourly.time || [];

    if (!times.length) {

      throw new Error(
        `No hourly forecast returned for ${meta.district}`
      );

    }

    const rain =
      (hourly.precipitation || []).map(
        value => Number.isFinite(value) ? value : 0
      );

    const probability = hourly.precipitation_probability || [];

    const soil = hourly.soil_moisture_0_to_7cm || [];

    const temperature = hourly.temperature_2m || [];

    const humidity = hourly.relative_humidity_2m || [];

    const stamp = forecastNowStamp();

    let start =
      times.findIndex(
        value => String(value).slice(0, 13) >= stamp
      );

    if (start < 0) {
      start = Math.max(0, times.length - FORECAST_HOURS - 1);
    }

    /* Antecedent precipitation index from the last 72 analysed hours */

    let apiIndex = 0;

    for (let i = Math.max(0, start - 72); i < start; i++) {
      apiIndex = apiIndex * FORECAST_API_DECAY + (rain[i] || 0);
    }

    const antecedent72 =
      rain
        .slice(Math.max(0, start - 72), start)
        .reduce((sum, value) => sum + value, 0);

    const hours = [];

    let cumulative = 0;

    let maxRain24 = 0;

    for (let step = 0; step < FORECAST_HOURS; step++) {

      const index = start + step;

      if (index >= times.length) {
        break;
      }

      const hourRain = rain[index] || 0;

      apiIndex = apiIndex * FORECAST_API_DECAY + hourRain;

      cumulative += hourRain;

      const rain24 =
        rain
          .slice(Math.max(0, index - 23), index + 1)
          .reduce((sum, value) => sum + value, 0);

      if (rain24 > maxRain24) {
        maxRain24 = rain24;
      }

      const soilValue =
        Number.isFinite(soil[index])
          ? soil[index]
          : null;

      const soilFactor =
        soilValue === null
          ? forecastNorm(apiIndex, 0, 160)
          : forecastNorm(soilValue, 0.18, 0.42);

      const trigger =
        100 * forecastClamp(
          0.45 * forecastNorm(rain24, 2, 110) +
          0.30 * forecastNorm(apiIndex, 5, 180) +
          0.25 * soilFactor,
          0,
          1
        );

      const risk =
        forecastClamp(
          FORECAST_WEIGHT_BASE * meta.baseRisk +
          FORECAST_WEIGHT_TRIGGER * trigger,
          0,
          100
        );

      hours.push({

        time: times[index],

        step: step,

        rain: hourRain,

        rain24: rain24,

        apiIndex: apiIndex,

        soil: soilValue,

        probability:
          Number.isFinite(probability[index])
            ? probability[index]
            : null,

        temperature:
          Number.isFinite(temperature[index])
            ? temperature[index]
            : null,

        humidity:
          Number.isFinite(humidity[index])
            ? humidity[index]
            : null,

        trigger: trigger,

        risk: risk

      });

    }

    if (!hours.length) {

      throw new Error(
        `Forecast window is empty for ${meta.district}`
      );

    }

    const peak =
      hours.reduce(
        (best, hour) =>
          hour.risk > best.risk ? hour : best,
        hours[0]
      );

    const firstHigh =
      hours.find(hour => hour.risk >= 60) || null;

    const windows = [];

    for (let day = 0; day < 3; day++) {

      const slice =
        hours.filter(
          hour =>
            hour.step >= day * 24 &&
            hour.step < (day + 1) * 24
        );

      if (!slice.length) {
        continue;
      }

      const slicePeak =
        slice.reduce(
          (best, hour) => hour.risk > best.risk ? hour : best,
          slice[0]
        );

      windows.push({

        label: `Day ${day + 1}`,

        range:
          `${forecastLabel(slice[0].time)} → ${forecastLabel(slice[slice.length - 1].time, false)}`,

        rain:
          slice.reduce((sum, hour) => sum + hour.rain, 0),

        peakRisk: slicePeak.risk,

        peakTime: slicePeak.time

      });

    }

    const sixHourly = [];

    for (let offset = 0; offset < hours.length; offset += 6) {

      const slice = hours.slice(offset, offset + 6);

      if (!slice.length) {
        continue;
      }

      const slicePeak =
        slice.reduce(
          (best, hour) => hour.risk > best.risk ? hour : best,
          slice[0]
        );

      sixHourly.push({

        label:
          `${forecastLabel(slice[0].time)} – ${forecastLabel(slice[slice.length - 1].time, false)}`,

        rain:
          slice.reduce((sum, hour) => sum + hour.rain, 0),

        peakRisk: slicePeak.risk

      });

    }

    return {

      ...meta,

      hours: hours,

      sixHourly: sixHourly,

      windows: windows,

      summary: {

        peakRisk: peak.risk,

        peakTime: peak.time,

        rain72: cumulative,

        maxRain24: maxRain24,

        antecedent72: antecedent72,

        leadHours: firstHigh ? firstHigh.step : null,

        leadTime: firstHigh ? firstHigh.time : null,

        elevation:
          Number.isFinite(block?.elevation)
            ? block.elevation
            : null

      }

    };

  }


  /* -----------------------------------------------------------------------
     Loader
     ----------------------------------------------------------------------- */

  async function loadForecast(force = false) {

    if (forecastState.loading) {
      return;
    }

    const candidates = forecastCandidates();

    if (!candidates.length) {

      forecastState.loaded = false;

      forecastState.error =
        "No geolocated ML records are loaded yet, so no district can be forecast.";

      renderForecast();

      return;

    }

    const signature = forecastSignature(candidates);

    if (
      !force &&
      forecastState.loaded &&
      forecastState.signature === signature
    ) {

      renderForecast();

      return;

    }

    forecastState.loading = true;

    forecastState.error = null;

    renderForecast();

    try {

      const blocks =
        await forecastFetchWeather(candidates);

      const districts =
        candidates.map(
          (meta, index) =>
            forecastCompute(meta, blocks[index])
        );

      districts.sort(
        (a, b) =>
          b.summary.peakRisk - a.summary.peakRisk
      );

      forecastState.districts = districts;

      forecastState.signature = signature;

      forecastState.generatedAt = new Date();

      forecastState.loaded = true;

      if (
        !forecastState.selectedKey ||
        !districts.some(item => item.key === forecastState.selectedKey)
      ) {

        forecastState.selectedKey = districts[0].key;

      }

    } catch (error) {

      console.error(
        "[PRAVAHA] Forecast error:",
        error
      );

      forecastState.loaded = false;

      forecastState.districts = [];

      forecastState.error =
        error.message ||
        "Unable to reach the meteorological forecast service.";

    } finally {

      forecastState.loading = false;

      renderForecast();

    }

  }


  function selectForecastDistrict(key) {

    if (!key) {
      return;
    }

    forecastState.selectedKey = key;

    renderForecast();

  }


  function forecastSelected() {

    return (
      forecastState.districts.find(
        item => item.key === forecastState.selectedKey
      ) ||
      forecastState.districts[0] ||
      null
    );

  }


  /* -----------------------------------------------------------------------
     Rendering
     ----------------------------------------------------------------------- */

  function renderForecastChart(district) {

    destroyChart("forecast");

    const canvas = $("forecastChart");

    if (
      !canvas ||
      !window.Chart ||
      !district
    ) {
      return;
    }

    const labels =
      district.hours.map(
        hour =>
          hour.step % 6 === 0
            ? forecastLabel(hour.time)
            : ""
      );

    app.charts.forecast =
      new Chart(
        canvas,
        {

          data: {

            labels: labels,

            datasets: [

              {
                type: "bar",
                label: "Rainfall (mm/h)",
                data: district.hours.map(hour => Number(hour.rain.toFixed(2))),
                backgroundColor: "#60a5fa",
                borderWidth: 0,
                yAxisID: "y1",
                order: 2
              },

              {
                type: "line",
                label: "Triggering index (0-100)",
                data: district.hours.map(hour => Number(hour.risk.toFixed(1))),
                borderColor: "#dc2626",
                backgroundColor: "rgba(220,38,38,0.08)",
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3,
                fill: true,
                yAxisID: "y",
                order: 1
              }

            ]

          },

          options: {

            responsive: true,

            maintainAspectRatio: false,

            interaction: {
              mode: "index",
              intersect: false
            },

            plugins: {

              legend: {
                display: true,
                labels: {
                  boxWidth: 10,
                  font: { size: 10 }
                }
              },

              tooltip: {

                callbacks: {

                  title: items => {

                    const hour =
                      district.hours[items[0].dataIndex];

                    return hour
                      ? forecastLabel(hour.time)
                      : "";

                  },

                  afterBody: items => {

                    const hour =
                      district.hours[items[0].dataIndex];

                    if (!hour) {
                      return "";
                    }

                    const lines = [

                      `Rolling 24h rain: ${forecastRound(hour.rain24)} mm`,

                      `Antecedent index: ${forecastRound(hour.apiIndex)}`

                    ];

                    if (hour.soil !== null) {
                      lines.push(`Soil moisture: ${forecastRound(hour.soil, 3)} m³/m³`);
                    }

                    if (hour.probability !== null) {
                      lines.push(`Rain probability: ${hour.probability}%`);
                    }

                    return lines;

                  }

                }

              }

            },

            scales: {

              x: {
                grid: { display: false },
                ticks: {
                  autoSkip: false,
                  maxRotation: 0,
                  font: { size: 9 }
                }
              },

              y: {
                position: "left",
                min: 0,
                max: 100,
                title: {
                  display: true,
                  text: "Risk index",
                  font: { size: 10 }
                },
                grid: { color: "#e2e8f0" },
                ticks: { font: { size: 10 } }
              },

              y1: {
                position: "right",
                beginAtZero: true,
                title: {
                  display: true,
                  text: "mm / hour",
                  font: { size: 10 }
                },
                grid: { display: false },
                ticks: { font: { size: 10 } }
              }

            }

          }

        }

      );

  }


  function forecastAdvisoryLines(district) {

    const summary = district.summary;

    const category = getRiskCategory(summary.peakRisk);

    const lines = [];

    if (category === "CRITICAL") {

      lines.push(
        `Critical triggering conditions are projected for ${district.district}, ${district.state}. Pre-position SDRF/NDRF units and keep earth-moving equipment at known slide chainages.`
      );

      lines.push(
        "Recommend night-time traffic restriction on the affected NH/SH segment during the peak window."
      );

    } else if (category === "HIGH") {

      lines.push(
        `High triggering conditions are projected for ${district.district}, ${district.state}. Activate district-level monitoring and inspect drainage and cut-slopes before the peak window.`
      );

    } else if (category === "MODERATE") {

      lines.push(
        `Moderate triggering conditions are projected for ${district.district}, ${district.state}. Routine patrolling of vulnerable chainages is advised.`
      );

    } else {

      lines.push(
        `No significant rainfall trigger is projected for ${district.district}, ${district.state} in the next 72 hours.`
      );

    }

    if (summary.leadHours !== null) {

      lines.push(
        `Lead time to the first HIGH-risk hour is approximately ${summary.leadHours} hour${summary.leadHours === 1 ? "" : "s"} (${forecastLabel(summary.leadTime)} IST).`
      );

    }

    if (summary.maxRain24 >= 100) {

      lines.push(
        `Rolling 24-hour rainfall peaks at ${forecastRound(summary.maxRain24)} mm, above the 100 mm empirical debris-flow threshold for the region.`
      );

    }

    if (summary.antecedent72 >= 40) {

      lines.push(
        `The catchment is already wet — ${forecastRound(summary.antecedent72)} mm fell in the preceding 72 hours, so failures may occur at lower rainfall intensity.`
      );

    }

    lines.push(
      `Dominant historical failure mode here: ${district.dominantEvent}, across ${district.sites} inventoried site${district.sites === 1 ? "" : "s"}.`
    );

    return lines;

  }


  function renderForecast() {

    const statusElement = $("forecastStatus");

    const loadingElement = $("forecastLoading");

    const errorElement = $("forecastError");

    const bodyElement = $("forecastBody");

    const selectElement = $("forecastDistrict");

    if (
      !statusElement ||
      !bodyElement ||
      !errorElement ||
      !loadingElement
    ) {
      return;
    }

    /* Loading state */

    if (forecastState.loading) {

      loadingElement.classList.remove("hidden");

      errorElement.classList.add("hidden");

      bodyElement.classList.add("hidden");

      statusElement.textContent =
        "Contacting meteorological forecast service…";

      return;

    }

    loadingElement.classList.add("hidden");

    /* Error state */

    if (forecastState.error) {

      errorElement.classList.remove("hidden");

      bodyElement.classList.add("hidden");

      setText(
        "forecastErrorMessage",
        forecastState.error
      );

      statusElement.textContent =
        "Forecast could not be generated.";

      return;

    }

    errorElement.classList.add("hidden");

    if (!forecastState.loaded) {

      bodyElement.classList.add("hidden");

      statusElement.textContent =
        "Forecast not loaded yet.";

      return;

    }

    const district = forecastSelected();

    if (!district) {

      bodyElement.classList.add("hidden");

      return;

    }

    bodyElement.classList.remove("hidden");

    /* Selector */

    if (selectElement) {

      selectElement.innerHTML =
        forecastState.districts.map(
          item =>
            `<option value="${escapeHtml(item.key)}"${
              item.key === district.key ? " selected" : ""
            }>${escapeHtml(item.district)}, ${escapeHtml(item.state)} — ${
              Math.round(item.summary.peakRisk)
            }</option>`
        ).join("");

    }

    const summary = district.summary;

    const category = getRiskCategory(summary.peakRisk);

    const color = getRiskColor(summary.peakRisk);

    /* Status line */

    const generated =
      forecastState.generatedAt
        ? forecastState.generatedAt.toLocaleString(
            "en-IN",
            { timeZone: "Asia/Kolkata" }
          )
        : "--";

    statusElement.textContent =
      `Forecast generated ${generated} IST · ${forecastState.districts.length} districts modelled · ${district.hours.length} hourly steps · lat ${district.lat.toFixed(3)}, lon ${district.lon.toFixed(3)}`;

    /* Summary cards */

    setText(
      "fcPeakRisk",
      Math.round(summary.peakRisk)
    );

    const badge = $("fcPeakBadge");

    if (badge) {

      badge.textContent = category;

      badge.style.color = color;

    }

    const peakValue = $("fcPeakRisk");

    if (peakValue) {
      peakValue.style.color = color;
    }

    setText(
      "fcPeakWindow",
      `${forecastLabel(summary.peakTime)} IST`
    );

    setText(
      "fcPeakLead",
      summary.leadHours === null
        ? "No HIGH-risk hour in window"
        : `HIGH risk in ~${summary.leadHours} h`
    );

    setText(
      "fcRain72",
      `${forecastRound(summary.rain72)} mm`
    );

    setText(
      "fcRain24",
      `${forecastRound(summary.maxRain24)} mm`
    );

    setText(
      "fcAnte72",
      `${forecastRound(summary.antecedent72)} mm`
    );

    setText(
      "fcBaseRisk",
      Math.round(district.baseRisk)
    );

    setText(
      "fcSites",
      `${district.sites} inventoried site${district.sites === 1 ? "" : "s"}`
    );

    const chartMeta = $("forecastChartMeta");

    if (chartMeta) {

      chartMeta.textContent =
        `${district.district}, ${district.state} · next ${district.hours.length} hours`;

    }

    /* Chart */

    renderForecastChart(district);

    /* Day windows */

    const windowsElement = $("forecastWindows");

    if (windowsElement) {

      windowsElement.innerHTML =
        district.windows.map(
          window => {

            const windowCategory =
              getRiskCategory(window.peakRisk);

            const windowColor =
              getRiskColor(window.peakRisk);

            return `
              <div class="bg-white rounded-md border border-slate-200 p-3 shadow-sm">
                <div class="flex items-center justify-between">
                  <div class="text-xs font-bold">${escapeHtml(window.label)}</div>
                  <div class="text-[10px] font-semibold" style="color:${windowColor}">
                    ${escapeHtml(windowCategory)}
                  </div>
                </div>
                <div class="text-[10px] text-slate-500 mt-0.5">${escapeHtml(window.range)} IST</div>
                <div class="flex items-end justify-between mt-2">
                  <div>
                    <div class="text-[10px] uppercase text-slate-500">Peak risk</div>
                    <div class="text-lg font-bold" style="color:${windowColor}">
                      ${Math.round(window.peakRisk)}
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-[10px] uppercase text-slate-500">Rainfall</div>
                    <div class="text-lg font-bold text-slate-700">
                      ${forecastRound(window.rain)} <span class="text-[10px] font-normal">mm</span>
                    </div>
                  </div>
                </div>
                <div class="mt-2 h-1.5 w-full bg-slate-100 rounded">
                  <div class="h-1.5 rounded" style="width:${Math.round(window.peakRisk)}%;background:${windowColor}"></div>
                </div>
              </div>
            `;

          }
        ).join("");

    }

    /* Six-hourly table */

    const tableBody = $("forecastTableBody");

    if (tableBody) {

      tableBody.innerHTML =
        district.sixHourly.map(
          slot => {

            const slotCategory =
              getRiskCategory(slot.peakRisk);

            const slotColor =
              getRiskColor(slot.peakRisk);

            return `
              <tr class="border-b border-slate-100">
                <td class="py-1.5">${escapeHtml(slot.label)}</td>
                <td class="py-1.5 text-right">${forecastRound(slot.rain)}</td>
                <td class="py-1.5 text-right font-semibold" style="color:${slotColor}">
                  ${Math.round(slot.peakRisk)}
                </td>
                <td class="py-1.5 pl-3 font-semibold" style="color:${slotColor}">
                  ${escapeHtml(slotCategory)}
                </td>
              </tr>
            `;

          }
        ).join("");

    }

    /* District ranking */

    const rankingBody = $("forecastRankingBody");

    if (rankingBody) {

      rankingBody.innerHTML =
        forecastState.districts.map(
          item => {

            const itemColor =
              getRiskColor(item.summary.peakRisk);

            const active =
              item.key === district.key;

            return `
              <tr class="border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${
                active ? "bg-slate-50" : ""
              }" onclick="selectForecastDistrict('${escapeHtml(item.key)}')">
                <td class="py-1.5">
                  <div class="font-semibold">${escapeHtml(item.district)}</div>
                  <div class="text-[10px] text-slate-500">${escapeHtml(item.state)}</div>
                </td>
                <td class="py-1.5 text-right">${forecastRound(item.summary.rain72)} mm</td>
                <td class="py-1.5 text-right font-semibold" style="color:${itemColor}">
                  ${Math.round(item.summary.peakRisk)}
                </td>
                <td class="py-1.5 pl-3 font-semibold" style="color:${itemColor}">
                  ${escapeHtml(getRiskCategory(item.summary.peakRisk))}
                </td>
              </tr>
            `;

          }
        ).join("");

    }

    /* Advisory */

    const advisoryElement = $("forecastAdvisory");

    if (advisoryElement) {

      advisoryElement.innerHTML =
        forecastAdvisoryLines(district).map(
          line =>
            `<div class="flex items-start gap-2">
               <span class="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:${color}"></span>
               <span>${escapeHtml(line)}</span>
             </div>`
        ).join("");

    }

    if (window.lucide) {
      lucide.createIcons();
    }

  }


  /* =======================================================================
     COMMUNITY FIELD REPORTS (USER FEEDBACK / PHOTO UPLOADS)

     Client-side only: submissions and photos are compressed to data URLs
     and kept in this browser's localStorage. Nothing is sent to a server,
     and nothing here touches app.records or any other section of the app.
     ======================================================================= */

  const FEEDBACK_STORAGE_KEY = "pravaha_feedback_reports_v1";

  const FEEDBACK_MAX_IMAGES_PER_REPORT = 3;

  const FEEDBACK_MAX_FILE_MB = 5;

  const FEEDBACK_MAX_STORED_REPORTS = 40;

  const FEEDBACK_IMAGE_MAX_DIMENSION = 900;

  const feedbackState = {

    items: [],

    pendingImages: [],

    lightbox: {
      itemId: null,
      index: 0
    }

  };


  /* -----------------------------------------------------------------------
     Placeholder "sample" photo generator — a self-contained inline SVG so
     the gallery has content out of the box, with no external image
     requests and no risk of misrepresenting a stock photo as a real
     submission. Clearly labelled as a demo placeholder within the image.
     ----------------------------------------------------------------------- */

  function feedbackPlaceholderImage(hue, label) {

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420">
        <rect width="100%" height="100%" fill="hsl(${hue},60%,93%)" />
        <polygon points="0,340 150,210 260,290 390,150 520,270 640,200 640,420 0,420"
          fill="hsl(${hue},50%,55%)" opacity="0.9" />
        <polygon points="120,340 260,290 340,340" fill="hsl(${hue},45%,42%)" opacity="0.85" />
        <circle cx="560" cy="80" r="38" fill="hsl(${hue},75%,72%)" />
        <text x="22" y="368" font-family="Arial, sans-serif" font-size="21" font-weight="700"
          fill="hsl(${hue},45%,18%)">${label}</text>
        <text x="22" y="392" font-family="Arial, sans-serif" font-size="12"
          fill="hsl(${hue},35%,32%)">Demo placeholder photo — no real image attached</text>
      </svg>
    `.trim();

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  }


  function feedbackSeedReports() {

    const now = Date.now();

    const hoursAgo = hours => now - hours * 3600 * 1000;

    return [

      {
        id: "seed-1",
        name: "Field Volunteer",
        state: "Mizoram",
        district: "Aizawl",
        comment:
          "Fresh cracks appeared along the cut-slope above the NH after yesterday's rain. " +
          "Flagging before it widens further.",
        images: [
          feedbackPlaceholderImage(210, "Cut-slope crack, Aizawl")
        ],
        timestamp: hoursAgo(6),
        seed: true
      },

      {
        id: "seed-2",
        name: "Local Resident",
        state: "Assam",
        district: "Dima Hasao",
        comment:
          "Debris is partially blocking the drainage channel near the village road " +
          "and water has started pooling on one side.",
        images: [
          feedbackPlaceholderImage(28, "Blocked drainage, Dima Hasao")
        ],
        timestamp: hoursAgo(19),
        seed: true
      },

      {
        id: "seed-3",
        name: "Highway Patrol",
        state: "Arunachal Pradesh",
        district: "West Siang",
        comment:
          "Minor rockfall on the SH shoulder, cleared by evening, but the slope above " +
          "still looks loose after the recent rain.",
        images: [
          feedbackPlaceholderImage(155, "Rockfall, West Siang — wide"),
          feedbackPlaceholderImage(160, "Rockfall, West Siang — close")
        ],
        timestamp: hoursAgo(44),
        seed: true
      }

    ];

  }


  function loadFeedbackFromStorage() {

    try {

      const raw = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);

      if (!raw) {

        feedbackState.items = feedbackSeedReports();

        saveFeedbackToStorage();

        return;

      }

      const parsed = JSON.parse(raw);

      feedbackState.items =
        Array.isArray(parsed) && parsed.length
          ? parsed
          : feedbackSeedReports();

    } catch (error) {

      console.warn(
        "[PRAVAHA] Feedback storage read failed, using samples only:",
        error
      );

      feedbackState.items = feedbackSeedReports();

    }

  }


  function saveFeedbackToStorage() {

    try {

      window.localStorage.setItem(
        FEEDBACK_STORAGE_KEY,
        JSON.stringify(
          feedbackState.items.slice(0, FEEDBACK_MAX_STORED_REPORTS)
        )
      );

      return true;

    } catch (error) {

      console.warn(
        "[PRAVAHA] Feedback storage write failed:",
        error
      );

      return false;

    }

  }


  function initFeedback() {

    loadFeedbackFromStorage();

    renderFeedback();

  }


  /* -----------------------------------------------------------------------
     Upload handling: downscale to a max dimension and re-encode as JPEG so
     a phone photo doesn't blow the ~5MB localStorage budget.
     ----------------------------------------------------------------------- */

  function feedbackReadAndCompress(file) {

    return new Promise(
      (resolve, reject) => {

        if (!file.type.startsWith("image/")) {

          reject(new Error(`"${file.name}" is not an image file.`));

          return;

        }

        if (file.size > FEEDBACK_MAX_FILE_MB * 1024 * 1024) {

          reject(
            new Error(`"${file.name}" is larger than ${FEEDBACK_MAX_FILE_MB} MB.`)
          );

          return;

        }

        const reader = new FileReader();

        reader.onerror = () =>
          reject(new Error(`Could not read "${file.name}".`));

        reader.onload = () => {

          const img = new Image();

          img.onerror = () =>
            reject(new Error(`"${file.name}" could not be decoded as an image.`));

          img.onload = () => {

            const scale =
              Math.min(
                1,
                FEEDBACK_IMAGE_MAX_DIMENSION / Math.max(img.width, img.height)
              );

            const canvas = document.createElement("canvas");

            canvas.width = Math.max(1, Math.round(img.width * scale));

            canvas.height = Math.max(1, Math.round(img.height * scale));

            const ctx = canvas.getContext("2d");

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            resolve(canvas.toDataURL("image/jpeg", 0.78));

          };

          img.src = reader.result;

        };

        reader.readAsDataURL(file);

      }
    );

  }


  function feedbackShowFileError(message) {

    const el = $("feedbackFileError");

    if (!el) {
      return;
    }

    if (!message) {

      el.classList.add("hidden");

      el.textContent = "";

      return;

    }

    el.textContent = message;

    el.classList.remove("hidden");

  }


  async function handleFeedbackFileChange(event) {

    feedbackShowFileError(null);

    const input = event.target;

    const files = Array.from(input.files || []);

    input.value = "";

    if (!files.length) {
      return;
    }

    const room =
      FEEDBACK_MAX_IMAGES_PER_REPORT - feedbackState.pendingImages.length;

    if (room <= 0) {

      feedbackShowFileError(
        `You can attach up to ${FEEDBACK_MAX_IMAGES_PER_REPORT} photos per report.`
      );

      return;

    }

    const toProcess = files.slice(0, room);

    if (files.length > room) {

      feedbackShowFileError(
        `Only the first ${room} photo${room === 1 ? "" : "s"} were added ` +
        `(limit is ${FEEDBACK_MAX_IMAGES_PER_REPORT} per report).`
      );

    }

    for (const file of toProcess) {

      try {

        const dataUrl = await feedbackReadAndCompress(file);

        feedbackState.pendingImages.push(dataUrl);

      } catch (error) {

        feedbackShowFileError(error.message);

      }

    }

    renderFeedbackPreviewStrip();

  }


  function removeFeedbackPendingImage(index) {

    feedbackState.pendingImages.splice(index, 1);

    renderFeedbackPreviewStrip();

  }


  function renderFeedbackPreviewStrip() {

    const strip = $("feedbackPreviewStrip");

    if (!strip) {
      return;
    }

    strip.innerHTML =
      feedbackState.pendingImages.map(
        (src, index) => `
          <div class="relative w-16 h-16">
            <img src="${src}" class="w-16 h-16 object-cover rounded border border-slate-200" />
            <button
              type="button"
              onclick="removeFeedbackPendingImage(${index})"
              class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-800 text-white text-[10px] leading-4 text-center">
              ×
            </button>
          </div>
        `
      ).join("");

  }


  function updateFeedbackCharCount() {

    const textarea = $("feedbackComment");

    setText(
      "feedbackCharCount",
      String(textarea ? textarea.value.length : 0)
    );

  }


  function feedbackFlashStatus(message, isError) {

    const el = $("feedbackSubmitStatus");

    if (!el) {
      return;
    }

    el.textContent = message;

    el.className =
      `text-[11px] text-center ${isError ? "text-red-600" : "text-emerald-600"}`;

    el.classList.remove("hidden");

    setTimeout(
      () => el.classList.add("hidden"),
      4000
    );

  }


  function submitFeedback(event) {

    event.preventDefault();

    const comment = $("feedbackComment")?.value.trim() || "";

    if (!comment) {

      feedbackFlashStatus("Please describe what you observed.", true);

      return;

    }

    const item = {

      id: `fb-${Date.now()}-${Math.round(Math.random() * 1e6)}`,

      name: $("feedbackName")?.value.trim() || "Anonymous",

      state: $("feedbackState")?.value || "Other",

      district: $("feedbackDistrict")?.value.trim() || "Unspecified",

      comment: comment,

      images: [...feedbackState.pendingImages],

      timestamp: Date.now(),

      seed: false

    };

    feedbackState.items.unshift(item);

    const saved = saveFeedbackToStorage();

    if (!saved) {

      /* Storage quota exceeded: keep the report visible for this session
         but drop its images first (the heaviest payload) and retry once. */

      item.images = [];

      const retried = saveFeedbackToStorage();

      feedbackFlashStatus(
        retried
          ? "Report saved, but local storage was full so photos were not kept. Try fewer or smaller images."
          : "Report added for this session, but local storage is full and could not be saved.",
        true
      );

    } else {

      feedbackFlashStatus("Thank you — your field report has been added.", false);

    }

    $("feedbackForm")?.reset();

    feedbackState.pendingImages = [];

    renderFeedbackPreviewStrip();

    updateFeedbackCharCount();

    feedbackShowFileError(null);

    renderFeedback();

  }


  function deleteFeedbackItem(id) {

    feedbackState.items =
      feedbackState.items.filter(item => item.id !== id);

    saveFeedbackToStorage();

    renderFeedback();

  }


  function clearAllFeedback() {

    if (
      !window.confirm(
        "Remove all locally stored field reports (including the sample ones) from this browser?"
      )
    ) {
      return;
    }

    feedbackState.items = [];

    saveFeedbackToStorage();

    renderFeedback();

  }


  function feedbackTimeAgo(timestamp) {

    const diffMinutes =
      Math.max(0, Math.round((Date.now() - timestamp) / 60000));

    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }

    const diffHours = Math.round(diffMinutes / 60);

    if (diffHours < 24) {
      return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
    }

    const diffDays = Math.round(diffHours / 24);

    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  }


  function feedbackCardMarkup(item) {

    const cover =
      item.images && item.images.length
        ? item.images[0]
        : null;

    const extraCount =
      item.images && item.images.length > 1
        ? item.images.length - 1
        : 0;

    return `
      <div class="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden flex flex-col">

        ${
          cover
            ? `
              <div class="relative">
                <img
                  src="${cover}"
                  onclick="openFeedbackLightbox('${item.id}', 0)"
                  class="w-full h-40 object-cover cursor-pointer" />
                ${
                  extraCount > 0
                    ? `<span class="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">+${extraCount} more</span>`
                    : ""
                }
                ${
                  item.seed
                    ? `<span class="absolute top-1.5 left-1.5 bg-slate-800/80 text-white text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide">Sample</span>`
                    : ""
                }
              </div>
            `
            : `
              <div class="w-full h-16 bg-slate-50 flex items-center justify-center text-[10px] text-slate-400 border-b border-slate-100">
                No photo attached
              </div>
            `
        }

        <div class="p-3 flex-1 flex flex-col">

          <div class="flex items-start justify-between gap-2">

            <div>
              <div class="text-xs font-bold">${escapeHtml(item.name)}</div>
              <div class="text-[10px] text-slate-500">
                ${escapeHtml(item.district)}, ${escapeHtml(item.state)}
              </div>
            </div>

            <div class="text-[10px] text-slate-400 whitespace-nowrap">
              ${escapeHtml(feedbackTimeAgo(item.timestamp))}
            </div>

          </div>

          <p class="text-[11px] text-slate-700 mt-2 leading-relaxed flex-1">
            ${escapeHtml(item.comment)}
          </p>

          <div class="flex items-center justify-end mt-2 pt-2 border-t border-slate-100">

            <button
              onclick="deleteFeedbackItem('${item.id}')"
              class="text-[10px] text-slate-400 hover:text-red-600">
              Remove
            </button>

          </div>

        </div>

      </div>
    `;

  }


  function renderFeedback() {

    const gallery = $("feedbackGallery");

    const emptyState = $("feedbackEmpty");

    if (!gallery) {
      return;
    }

    setText(
      "feedbackCount",
      `${feedbackState.items.length} report${feedbackState.items.length === 1 ? "" : "s"}`
    );

    if (!feedbackState.items.length) {

      gallery.innerHTML = "";

      emptyState?.classList.remove("hidden");

      if (window.lucide) {
        lucide.createIcons();
      }

      return;

    }

    emptyState?.classList.add("hidden");

    gallery.innerHTML =
      feedbackState.items
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(feedbackCardMarkup)
        .join("");

    if (window.lucide) {
      lucide.createIcons();
    }

  }


  /* -----------------------------------------------------------------------
     Lightbox
     ----------------------------------------------------------------------- */

  function openFeedbackLightbox(itemId, index) {

    const item =
      feedbackState.items.find(entry => entry.id === itemId);

    if (
      !item ||
      !item.images ||
      !item.images.length
    ) {
      return;
    }

    feedbackState.lightbox.itemId = itemId;

    feedbackState.lightbox.index =
      Math.max(0, Math.min(index, item.images.length - 1));

    renderFeedbackLightbox();

    const modal = $("feedbackLightbox");

    if (modal) {

      modal.classList.remove("hidden");

      modal.classList.add("flex");

    }

  }


  function renderFeedbackLightbox() {

    const item =
      feedbackState.items.find(
        entry => entry.id === feedbackState.lightbox.itemId
      );

    if (!item) {
      return;
    }

    const img = $("feedbackLightboxImg");

    if (img) {

      img.src =
        item.images[feedbackState.lightbox.index];

    }

    setText(
      "feedbackLightboxCaption",
      `${item.name} — ${item.district}, ${item.state} · ` +
      `photo ${feedbackState.lightbox.index + 1} of ${item.images.length}`
    );

  }


  function feedbackLightboxNav(event, direction) {

    event?.stopPropagation();

    const item =
      feedbackState.items.find(
        entry => entry.id === feedbackState.lightbox.itemId
      );

    if (
      !item ||
      item.images.length < 2
    ) {
      return;
    }

    const total = item.images.length;

    feedbackState.lightbox.index =
      (feedbackState.lightbox.index + direction + total) % total;

    renderFeedbackLightbox();

  }


  function closeFeedbackLightbox(event) {

    event?.stopPropagation();

    const modal = $("feedbackLightbox");

    if (modal) {

      modal.classList.add("hidden");

      modal.classList.remove("flex");

    }

  }


  /* =======================================================================
     ALERT SOUND (synthesised — no audio files, no network requests)

     Red (HIGH/CRITICAL) gets a short two-tone siren wail; yellow
     (LOW/MODERATE) gets a softer double chime. Muting is a UI preference
     remembered in localStorage. Anything the Web Audio API doesn't
     support in a given browser fails silently — the visual flash still
     works either way.
     ======================================================================= */

  const ALERT_SOUND_MUTE_KEY = "pravaha_alert_sound_muted";

  /* Flash + siren run for the same length of time so the audio and the
     visual pulsing end together. 12s sits in the middle of the requested
     10-15s range. */

  const ALERT_ALARM_DURATION_MS = 12000;

  const ALERT_ALARM_DURATION_SEC = ALERT_ALARM_DURATION_MS / 1000;

  let activeAlertOscillators = [];

  let alertSoundMuted = false;

  try {

    alertSoundMuted =
      window.localStorage.getItem(ALERT_SOUND_MUTE_KEY) === "1";

  } catch (error) {

    alertSoundMuted = false;

  }


  let sharedAlertAudioContext = null;


  function ensureAlertAudioContext() {

    if (sharedAlertAudioContext) {
      return sharedAlertAudioContext;
    }

    const AudioCtx =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioCtx) {
      return null;
    }

    sharedAlertAudioContext = new AudioCtx();

    return sharedAlertAudioContext;

  }


  /* Urgent two-tone wail, ~1.8s, for HIGH/CRITICAL clicks. */

  function playAlertSirenWail(ctx, duration) {

    const now = ctx.currentTime;

    /* Keep each wail cycle ~0.6s regardless of total duration, so a
       12-15s alarm wails several times rather than one long slow sweep. */

    const cycles = Math.max(1, Math.round(duration / 0.6));

    const cycleLen = duration / cycles;

    const osc = ctx.createOscillator();

    const gain = ctx.createGain();

    osc.type = "sawtooth";

    osc.connect(gain);

    gain.connect(ctx.destination);

    gain.gain.setValueAtTime(0.0001, now);

    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.05);

    gain.gain.setValueAtTime(0.22, now + duration - 0.2);

    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.frequency.setValueAtTime(600, now);

    for (let cycle = 0; cycle < cycles; cycle++) {

      const cycleStart = now + cycle * cycleLen;

      osc.frequency.linearRampToValueAtTime(
        1150,
        cycleStart + cycleLen * 0.5
      );

      osc.frequency.linearRampToValueAtTime(
        600,
        cycleStart + cycleLen
      );

    }

    osc.start(now);

    osc.stop(now + duration + 0.05);

    activeAlertOscillators.push(osc);

  }


  /* Softer double chime, ~0.4s, for LOW/MODERATE clicks. */

  function playAlertAdvisoryChime(ctx, duration) {

    const now = ctx.currentTime;

    const offsets = [];

    /* Repeat the beep-beep pair every 2s across the full duration. A short
       duration (e.g. the mute-toggle confirmation) naturally yields just
       one pair, since the loop stops as soon as an offset would exceed it. */

    for (let base = 0; base < duration; base += 2) {

      offsets.push(base, base + 0.22);

    }

    offsets.forEach(
      offset => {

        const osc = ctx.createOscillator();

        const gain = ctx.createGain();

        osc.type = "sine";

        osc.frequency.setValueAtTime(760, now + offset);

        osc.connect(gain);

        gain.connect(ctx.destination);

        gain.gain.setValueAtTime(0.0001, now + offset);

        gain.gain.exponentialRampToValueAtTime(0.16, now + offset + 0.02);

        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);

        osc.start(now + offset);

        osc.stop(now + offset + 0.2);

        activeAlertOscillators.push(osc);

      }
    );

  }


  function stopAlertSound() {

    if (!sharedAlertAudioContext) {
      return;
    }

    const now = sharedAlertAudioContext.currentTime;

    activeAlertOscillators.forEach(
      osc => {

        try {

          osc.stop(now);

        } catch (error) {

          /* Already stopped/finished — nothing to do. */

        }

      }
    );

    activeAlertOscillators = [];

  }


  function playAlertSound(severity, duration = ALERT_ALARM_DURATION_SEC) {

    if (alertSoundMuted) {
      return;
    }

    try {

      const ctx = ensureAlertAudioContext();

      if (!ctx) {
        return;
      }

      if (ctx.state === "suspended") {

        /* Resume on the user gesture that triggered this (marker click)
           rather than awaiting it, so the sound still plays this turn
           in browsers that start contexts suspended. */

        ctx.resume().catch(() => {});

      }

      /* A new alert click replaces whatever alarm is currently sounding
         rather than layering on top of it. */

      stopAlertSound();

      if (severity === "red") {

        playAlertSirenWail(ctx, duration);

      } else {

        playAlertAdvisoryChime(ctx, duration);

      }

    } catch (error) {

      console.warn(
        "[PRAVAHA] Alert sound could not play:",
        error
      );

    }

  }


  function updateGlobalAlertMuteButton() {

    const button = $("globalAlertMuteBtn");

    if (!button) {
      return;
    }

    button.textContent =
      alertSoundMuted ? "🔇" : "🔊";

    const label =
      alertSoundMuted
        ? "Unmute alert sound"
        : "Mute alert sound";

    button.title = label;

    button.setAttribute("aria-label", label);

  }


  function toggleGlobalAlertSound() {

    alertSoundMuted = !alertSoundMuted;

    try {

      window.localStorage.setItem(
        ALERT_SOUND_MUTE_KEY,
        alertSoundMuted ? "1" : "0"
      );

    } catch (error) {

      console.warn(
        "[PRAVAHA] Could not persist alert sound preference:",
        error
      );

    }

    updateGlobalAlertMuteButton();

    if (alertSoundMuted) {

      /* Silence anything currently sounding the instant the user mutes. */

      stopAlertSound();

    } else {

      /* Give a short audible confirmation of the new state — not the
         full-length alarm, just one beep pair. */

      playAlertSound("yellow", 0.4);

    }

  }


  /* =======================================================================
     GLOBAL MAP-CLICK ALERT FLASH

     Clicking a risk dot on either map (dashboard or full GIS) flashes the
     whole app shell red (HIGH/CRITICAL) or yellow (LOW/MODERATE) and shows
     a short banner, regardless of which tab happens to be open — the
     overlay and banner sit outside the tab sections so they are never
     hidden by switchTab().
     ======================================================================= */

  let globalAlertFlashTimer = null;


  function globalAlertSeverity(record) {

    return (
      Number.isFinite(record?.riskScore) &&
      record.riskScore >= 60
    )
      ? "red"
      : "yellow";

  }


  function triggerGlobalAlertFlash(record) {

    if (!record) {
      return;
    }

    const overlay = $("globalAlertFlash");

    const banner = $("globalAlertBanner");

    if (
      !overlay ||
      !banner
    ) {
      return;
    }

    const severity =
      globalAlertSeverity(record);

    playAlertSound(severity);

    /* Remove + reflow so a second click on the same marker restarts the
       CSS animation instead of being a no-op (class already present). */

    overlay.classList.remove(
      "hidden",
      "pravaha-flash-red",
      "pravaha-flash-yellow"
    );

    void overlay.offsetWidth;

    overlay.classList.add(
      severity === "red"
        ? "pravaha-flash-red"
        : "pravaha-flash-yellow"
    );

    banner.classList.remove(
      "hidden",
      "pravaha-banner-red",
      "pravaha-banner-yellow",
      "pravaha-banner-hide"
    );

    banner.classList.add(
      severity === "red"
        ? "pravaha-banner-red"
        : "pravaha-banner-yellow"
    );

    /* Two-step show so the slide/fade-in transition actually plays. */

    requestAnimationFrame(
      () => banner.classList.add("pravaha-banner-show")
    );

    setText(
      "globalAlertBannerTitle",
      severity === "red"
        ? `⚠ ${record.riskCategory} RISK ALERT`
        : `⚠ ${record.riskCategory} RISK ADVISORY`
    );

    setText(
      "globalAlertBannerSubtitle",
      `${record.district}, ${record.state} · Risk score ` +
      `${Number.isFinite(record.riskScore) ? record.riskScore.toFixed(1) : "--"}/100 · ` +
      `${record.eventType}`
    );

    if (window.lucide) {
      lucide.createIcons();
    }

    clearTimeout(globalAlertFlashTimer);

    globalAlertFlashTimer =
      setTimeout(
        dismissGlobalAlertFlash,
        ALERT_ALARM_DURATION_MS
      );

  }


  function dismissGlobalAlertFlash() {

    stopAlertSound();

    const overlay = $("globalAlertFlash");

    const banner = $("globalAlertBanner");

    overlay?.classList.remove(
      "pravaha-flash-red",
      "pravaha-flash-yellow"
    );

    overlay?.classList.add("hidden");

    banner?.classList.remove("pravaha-banner-show");

    banner?.classList.add("pravaha-banner-hide");

    clearTimeout(globalAlertFlashTimer);

    globalAlertFlashTimer =
      setTimeout(
        () => banner?.classList.add("hidden"),
        320
      );

  }


  /* =======================================================================
     GLOBAL FUNCTIONS USED BY index.html
     ======================================================================= */

  window.switchTab =
    switchTab;

  window.refreshAllData =
    refreshAllData;

  window.applyDashboardMapFilters =
    applyDashboardMapFilters;

  window.fitDashboardMap =
    fitDashboardMap;

  window.fitFullMap =
    fitFullMap;

  window.setMapHazard =
    setMapHazard;

  window.searchGIS =
    searchGIS;

  window.selectRecordById =
    selectRecordById;

  window.filterAlerts =
    filterAlerts;

  window.updateAnalysisSelectors =
    updateAnalysisSelectors;

  window.updateAnalysisLocations =
    updateAnalysisLocations;

  window.updateAnalysisData =
    updateAnalysisData;

  window.showApiConfig =
    showApiConfig;

  window.toggleGlobalAlertModal =
    toggleGlobalAlertModal;

  window.loadForecast =
    loadForecast;

  window.selectForecastDistrict =
    selectForecastDistrict;

  window.initFeedback =
    initFeedback;

  window.handleFeedbackFileChange =
    handleFeedbackFileChange;

  window.removeFeedbackPendingImage =
    removeFeedbackPendingImage;

  window.updateFeedbackCharCount =
    updateFeedbackCharCount;

  window.submitFeedback =
    submitFeedback;

  window.deleteFeedbackItem =
    deleteFeedbackItem;

  window.clearAllFeedback =
    clearAllFeedback;

  window.openFeedbackLightbox =
    openFeedbackLightbox;

  window.closeFeedbackLightbox =
    closeFeedbackLightbox;

  window.feedbackLightboxNav =
    feedbackLightboxNav;

  window.dismissGlobalAlertFlash =
    dismissGlobalAlertFlash;

  window.toggleGlobalAlertSound =
    toggleGlobalAlertSound;


  /* =======================================================================
     START APPLICATION
     ======================================================================= */

  document.addEventListener(
    "DOMContentLoaded",
    async () => {

      try {

        if (window.lucide) {

          lucide.createIcons();

        }


        startClock();


        initializeMaps();


        startAutoRefresh();


        initFeedback();


        updateGlobalAlertMuteButton();


        await refreshAllData();


        setTimeout(
          () => {

            app.dashboardMap
              ?.invalidateSize();

            app.fullMap
              ?.invalidateSize();

          },

          600

        );


      } catch (error) {

        console.error(

          "[PRAVAHA] Frontend startup error:",

          error

        );


        setApiStatus(

          `Frontend startup error: ${error.message}`,

          "error"

        );

      }

    }

  );

})();
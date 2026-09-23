"""
PRAVAHA AI - Flask REST API Backend
Serves landslide prediction data, summary dashboard statistics,
zone groupings, and live weather forecast integrations.
"""

import os
import re
import numpy as np
import pandas as pd
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__, static_folder=".", static_url_path="")

# Locate dataset CSV
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_CANDIDATES = [
    os.path.join(BASE_DIR, "NE_Region_Landslide_Predictions_Updated.csv"),
    os.path.join(BASE_DIR, "GSI_landslide_inventory_NE_Region.csv"),
    os.path.join(BASE_DIR, "GSI_landslide_inventory_NE_Region.csv.xls"),
]

CSV_PATH = next((path for path in DATA_CANDIDATES if os.path.exists(path)), None)

def load_and_preprocess_data():
    """Load and normalize prediction records."""
    if not CSV_PATH or not os.path.exists(CSV_PATH):
        return pd.DataFrame()

    df = pd.read_csv(CSV_PATH)
    
    # Standardize column names
    df.columns = [re.sub(r'\s+', ' ', col).strip() for col in df.columns]

    # Fill missing values
    df['State'] = df.get('State', pd.Series(['Unknown']*len(df))).fillna('Unknown').astype(str).str.strip()
    df['District'] = df.get('District', pd.Series(['Unknown']*len(df))).fillna('Unknown').astype(str).str.strip()
    df['Latitude'] = pd.to_numeric(df.get('Latitude', pd.Series([np.nan]*len(df))), errors='coerce')
    df['Longitude'] = pd.to_numeric(df.get('Longitude', pd.Series([np.nan]*len(df))), errors='coerce')

    # Drop invalid coordinates
    df = df.dropna(subset=['Latitude', 'Longitude']).copy()

    # Standardize fields
    df['Actual_Material'] = df.get('Actual_Material', df.get('Material Involved', 'Unknown')).fillna('Unknown')
    df['Predicted_Material'] = df.get('Predicted_Material', df['Actual_Material']).fillna('Unknown')
    df['Movement_Class'] = df.get('Movement_Class', df.get('Movement Type', 'Unknown')).fillna('Unknown')

    # Confidence scaling to percentage (0 - 100)
    conf = pd.to_numeric(df.get('Confidence', pd.Series([80.0]*len(df))), errors='coerce').fillna(0.8)
    if conf.max() <= 1.0:
        df['Confidence'] = conf * 100.0
    else:
        df['Confidence'] = conf

    # Highway Flag
    if 'Is_Highway' in df.columns:
        df['Is_Highway'] = pd.to_numeric(df['Is_Highway'], errors='coerce').fillna(0).astype(int)
    else:
        df['Is_Highway'] = 0

    # Calculate operational risk score if not explicitly present
    if 'Risk_Score' not in df.columns:
        risk_scores = []
        for _, row in df.iterrows():
            score = row['Confidence']
            mov = str(row['Movement_Class']).lower()
            if 'slide' in mov:
                score += 5
            elif 'fall' in mov:
                score += 3
            if row['Is_Highway'] == 1:
                score += 5
            risk_scores.append(min(round(score, 1), 99.0))
        df['Risk_Score'] = risk_scores

    # Assign risk level label
    def assign_level(score):
        if score >= 85:
            return 'CRITICAL'
        elif score >= 70:
            return 'HIGH'
        elif score >= 50:
            return 'MODERATE'
        return 'LOW'

    if 'Risk_Level' not in df.columns:
        df['Risk_Level'] = df['Risk_Score'].apply(assign_level)

    return df

# Global Data Cache
PREDICTIONS_DF = load_and_preprocess_data()


@app.route('/api/dashboard', methods=['GET'])
def get_dashboard_summary():
    """Returns top-level KPIs and risk metrics for the dashboard."""
    if PREDICTIONS_DF.empty:
        return jsonify({
            "status": "error",
            "message": "Dataset not found. Run landslide_model.py first to generate predictions."
        }), 500

    total_records = len(PREDICTIONS_DF)
    avg_risk = float(PREDICTIONS_DF['Risk_Score'].mean())
    critical_count = int((PREDICTIONS_DF['Risk_Level'] == 'CRITICAL').sum())
    high_count = int((PREDICTIONS_DF['Risk_Level'] == 'HIGH').sum())
    moderate_count = int((PREDICTIONS_DF['Risk_Level'] == 'MODERATE').sum())
    low_count = int((PREDICTIONS_DF['Risk_Level'] == 'LOW').sum())
    corridors_at_risk = int(PREDICTIONS_DF['District'].nunique())

    return jsonify({
        "status": "ok",
        "regionalRiskScore": round(avg_risk, 1),
        "totalPredictions": total_records,
        "criticalZones": critical_count,
        "highZones": high_count,
        "moderateZones": moderate_count,
        "lowZones": low_count,
        "activeAlerts": critical_count + high_count,
        "corridorsAtRisk": corridors_at_risk
    })


@app.route('/api/predictions', methods=['GET'])
@app.route('/predictions', methods=['GET'])
def get_predictions():
    """Returns spatial predictions with optional filtering."""
    if PREDICTIONS_DF.empty:
        return jsonify([])

    limit = request.args.get('limit', type=int)
    risk_filter = request.args.get('risk', type=str)

    df = PREDICTIONS_DF

    if risk_filter and risk_filter.upper() != 'ALL':
        df = df[df['Risk_Level'] == risk_filter.upper()]

    if limit and limit > 0:
        df = df.head(limit)

    records = []
    for idx, row in df.iterrows():
        records.append({
            "id": str(row.get('Slide_No', f"pred-{idx}")),
            "slideNo": str(row.get('Slide_No', f"pred-{idx}")),
            "state": str(row['State']),
            "district": str(row['District']),
            "lat": float(row['Latitude']),
            "lon": float(row['Longitude']),
            "actualMaterial": str(row['Actual_Material']),
            "predictedMaterial": str(row['Predicted_Material']),
            "confidence": round(float(row['Confidence']), 1),
            "movement": str(row['Movement_Class']),
            "isHighway": bool(row['Is_Highway']),
            "riskScore": float(row['Risk_Score']),
            "riskLevel": str(row['Risk_Level'])
        })

    return jsonify(records)


@app.route('/api/zones', methods=['GET'])
def get_vulnerable_zones():
    """Aggregates prediction records by State and District."""
    if PREDICTIONS_DF.empty:
        return jsonify([])

    grouped = PREDICTIONS_DF.groupby(['State', 'District']).agg(
        records=('Risk_Score', 'count'),
        criticalCount=('Risk_Level', lambda x: (x == 'CRITICAL').sum()),
        highCount=('Risk_Level', lambda x: (x == 'HIGH').sum()),
        avgRisk=('Risk_Score', 'mean'),
        dominantMovement=('Movement_Class', lambda x: x.mode()[0] if not x.empty else 'Unknown')
    ).reset_index()

    grouped = grouped.sort_values(by='avgRisk', ascending=False)

    zones = []
    for _, row in grouped.iterrows():
        zones.append({
            "state": str(row['State']),
            "district": str(row['District']),
            "records": int(row['records']),
            "critical": int(row['criticalCount']),
            "high": int(row['highCount']),
            "avgRisk": round(float(row['avgRisk']), 1),
            "dominantMovement": str(row['dominantMovement'])
        })

    return jsonify(zones)


@app.route('/api/forecast', methods=['GET'])
def get_weather_forecast():
    """Fetches real 72-hour weather forecast via Open-Meteo for given coordinates."""
    lat = request.args.get('lat', default=26.1445, type=float)
    lon = request.args.get('lon', default=91.7362, type=float)

    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}"
            f"&hourly=precipitation,relative_humidity_2m,soil_temperature_0_to_7cm"
            f"&timezone=Asia%2FKolkata&forecast_days=3"
        )
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 502


if __name__ == '__main__':
    print("Starting PRAVAHA AI REST Server on http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=True)
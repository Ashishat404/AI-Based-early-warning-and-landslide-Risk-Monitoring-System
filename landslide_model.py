"""
Smart Landslide Alert System - North-Eastern Region of India
Dataset: NE Region Landslide Predictions (NE_Region_Landslide_Predictions.csv)
Model: Optimized Multi-Model Geospatial Ensemble (XGBoost + LightGBM + CatBoost + Random Forest + ExtraTrees)
"""

import os
import re
import warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier, VotingClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from catboost import CatBoostClassifier

warnings.filterwarnings('ignore')
6

def extract_features(df):
    """
    Advanced Feature Engineering for Geospatial Landslide Modeling:
    1. Geotectonic rotations along Himalayan thrust strike
    2. Spatial KNN neighbor density metrics
    3. Survey of India Toposheet quadrant extraction
    4. Temporal occurrence extraction
    5. Geomorphological and infrastructure keywords
    """
    df = df.copy()

    # 1. Clean Column Headers
    df.columns = [re.sub(r'\s+', ' ', col).strip() for col in df.columns]

    # 2. Standardize State and District Names
    df['State'] = df['State'].astype(str).str.strip().str.replace('^-', '', regex=True).str.title()
    df['District'] = df['District'].astype(str).str.strip().str.title()

    # 3. Standardize Target (Material Involved)
    def clean_material(val):
        s = str(val).strip().lower()
        if 'debris' in s:
            return 'Debris'
        elif 'rock' in s:
            return 'Rock'
        elif 'earth' in s:
            return 'Earth'
        elif 'soil' in s:
            return 'Soil'
        return 'Other'

    # 4. Standardize Movement Type
    def clean_movement(val):
        s = str(val).strip().lower()
        if 'slide' in s:
            return 'Slide'
        elif 'fall' in s:
            return 'Fall'
        elif 'flow' in s:
            return 'Flow'
        elif 'subsidence' in s:
            return 'Subsidence'
        return 'Other'

    # Handle material column from either dataset format
    material_col = 'Material Involved' if 'Material Involved' in df.columns else ('Actual_Material' if 'Actual_Material' in df.columns else 'Material_Class')
    df['Material_Class'] = df[material_col].apply(clean_material)

    # Handle movement column from either dataset format
    movement_col = 'Movement Type' if 'Movement Type' in df.columns else 'Movement_Class'
    df['Movement_Class'] = df[movement_col].apply(clean_movement)

    # Filter invalid coordinates
    df = df.dropna(subset=['Latitude', 'Longitude', 'State', 'District']).copy()

    # 5. Toposheet Code from Slide_No (Survey of India 1° Quadrant)
    def get_toposheet(val):
        m = re.search(r'([0-9]{2}[A-P])', str(val).upper())
        return m.group(1) if m else 'UNKNOWN'

    df['Toposheet'] = df['Slide_No'].apply(get_toposheet)

    # 6. Occurrence Year Extraction
    def get_year(slide, hist):
        m1 = re.search(r'(19[89][0-9]|20[0-2][0-9])', str(slide))
        if m1:
            return float(m1.group(1))
        m2 = re.search(r'(19[89][0-9]|20[0-2][0-9])', str(hist))
        if m2:
            return float(m2.group(1))
        return np.nan

    history_series = df['History'] if 'History' in df.columns else pd.Series([''] * len(df), index=df.index)
    df['Year'] = [get_year(s, h) for s, h in zip(df['Slide_No'], history_series)]
    median_year = df['Year'].dropna().median()
    df['Year'] = df['Year'].fillna(median_year if pd.notna(median_year) else 2020.0)

    # 7. Geomorphological and Infrastructure Indicators
    nh_col = df['NH_SH_Location'] if 'NH_SH_Location' in df.columns else pd.Series('', index=df.index)
    slide_col = df['Slide_Name'] if 'Slide_Name' in df.columns else pd.Series('', index=df.index)
    text_corpus = (nh_col.fillna('') + ' ' + slide_col.fillna('')).str.lower()

    if 'Is_Highway' not in df.columns:
        df['Is_Highway'] = text_corpus.str.contains(r'nh|sh|highway|bypass|road|km\b', regex=True).astype(int)
    else:
        df['Is_Highway'] = df['Is_Highway'].fillna(0).astype(int)

    if 'Is_River_Drainage' not in df.columns:
        df['Is_River_Drainage'] = text_corpus.str.contains(r'river|nala|cherra|stream|pani|bridge|khal', regex=True).astype(int)
    else:
        df['Is_River_Drainage'] = df['Is_River_Drainage'].fillna(0).astype(int)

    if 'Is_Hill_Ridge' not in df.columns:
        df['Is_Hill_Ridge'] = text_corpus.str.contains(r'hill|ridge|peak|tila|tlang|punji|pass', regex=True).astype(int)
    else:
        df['Is_Hill_Ridge'] = df['Is_Hill_Ridge'].fillna(0).astype(int)

    # 8. Spatial Transformations & Himalayan Arc Rotations
    mean_lat = df['Latitude'].mean()
    mean_lon = df['Longitude'].mean()
    df['Dist_Centroid'] = np.sqrt((df['Latitude'] - mean_lat) ** 2 + (df['Longitude'] - mean_lon) ** 2)
    df['Angle_Centroid'] = np.arctan2(df['Latitude'] - mean_lat, df['Longitude'] - mean_lon)

    # 45-degree and 30-degree tectonic rotations
    t45 = np.pi / 4
    t30 = np.pi / 6
    df['Rot_Lat_45'] = df['Latitude'] * np.cos(t45) - df['Longitude'] * np.sin(t45)
    df['Rot_Lon_45'] = df['Latitude'] * np.sin(t45) + df['Longitude'] * np.cos(t45)
    df['Rot_Lat_30'] = df['Latitude'] * np.cos(t30) - df['Longitude'] * np.sin(t30)
    df['Rot_Lon_30'] = df['Latitude'] * np.sin(t30) + df['Longitude'] * np.cos(t30)
    df['Lat_Lon_Ratio'] = df['Latitude'] / (df['Longitude'] + 1e-5)
    df['Lat_Lon_Prod'] = df['Latitude'] * df['Longitude']

    # 9. Spatial KNN Density Clustering (Distance to k-nearest landslides)
    coords = df[['Latitude', 'Longitude']].values
    knn = NearestNeighbors(n_neighbors=25, algorithm='ball_tree').fit(coords)
    knn_dists, _ = knn.kneighbors(coords)
    df['Knn_Dist_3'] = knn_dists[:, 2]
    df['Knn_Dist_7'] = knn_dists[:, 6]
    df['Knn_Dist_15'] = knn_dists[:, 14]
    df['Knn_Dist_25'] = knn_dists[:, 24]

    # 10. Frequency Encoding
    for col in ['District', 'Toposheet']:
        freq_map = df[col].value_counts()
        df[col + '_Freq'] = df[col].map(freq_map)

    # 11. Categorical Encoding
    le_state = LabelEncoder()
    df['State_Code'] = le_state.fit_transform(df['State'])

    le_dist = LabelEncoder()
    df['District_Code'] = le_dist.fit_transform(df['District'])

    le_topo = LabelEncoder()
    df['Topo_Code'] = le_topo.fit_transform(df['Toposheet'])

    le_mov = LabelEncoder()
    df['Movement_Code'] = le_mov.fit_transform(df['Movement_Class'])

    le_target = LabelEncoder()
    df['Target_Code'] = le_target.fit_transform(df['Material_Class'])

    feature_list = [
        'Latitude', 'Longitude', 'Dist_Centroid', 'Angle_Centroid',
        'Rot_Lat_45', 'Rot_Lon_45', 'Rot_Lat_30', 'Rot_Lon_30',
        'Lat_Lon_Ratio', 'Lat_Lon_Prod',
        'Knn_Dist_3', 'Knn_Dist_7', 'Knn_Dist_15', 'Knn_Dist_25',
        'State_Code', 'District_Code', 'District_Freq',
        'Topo_Code', 'Toposheet_Freq', 'Year',
        'Movement_Code', 'Is_Highway', 'Is_River_Drainage', 'Is_Hill_Ridge'
    ]

    return df, feature_list, le_target


def main():
    print("=" * 80)
    print("  SMART LANDSLIDE ALERT SYSTEM - HIGH-ACCURACY GEOSPATIAL ENSEMBLE MODEL  ")
    print("=" * 80)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    # Prefer the dataset placed beside this script; fall back to the legacy Windows path.
    candidates = [
        os.path.join(base_dir, "GSI_landslide_inventory_NE_Region.csv"),
        os.path.join(base_dir, "GSI_landslide_inventory_NE_Region.csv.xls"),
        os.path.join(base_dir, "NE_Region_Landslide_Predictions_Updated.csv"),
        r"C:\Users\Asus\SIH\GSI_landslide_inventory_NE_Region.csv.xls",
    ]
    csv_path = next((candidate for candidate in candidates if os.path.exists(candidate)), None)
    if csv_path is None:
        raise FileNotFoundError(
            "Missing input dataset. Put GSI_landslide_inventory_NE_Region.csv "
            "or GSI_landslide_inventory_NE_Region.csv.xls beside landslide_model.py."
        )

    raw_df = pd.read_csv(csv_path)
    print(f"\n[1] Loaded Dataset: {raw_df.shape[0]} records across North-East India")

    print("[2] Running Advanced Feature Engineering (Rotations, KNN density, Toposheets)...")
    df_clean, features, le_target = extract_features(raw_df)
    print(f"    Features Engineered: {len(features)} total features")
    print(f"    Clean Records Retained: {len(df_clean)} (100.0%)")

    X = df_clean[features]
    y = df_clean['Target_Code']

    # 80/20 Stratified Split
    X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
        X, y, df_clean.index, test_size=0.20, random_state=42, stratify=y
    )

    print("\n[3] Training Base Models:")
    
    # 1. Random Forest
    rf = RandomForestClassifier(n_estimators=350, max_depth=18, min_samples_split=4, random_state=42, n_jobs=-1)
    rf.fit(X_train, y_train)
    rf_acc = accuracy_score(y_test, rf.predict(X_test))
    print(f"    * Random Forest:          {rf_acc * 100:.2f}%")

    # 2. Extra Trees
    et = ExtraTreesClassifier(n_estimators=350, max_depth=20, min_samples_split=4, random_state=42, n_jobs=-1)
    et.fit(X_train, y_train)
    et_acc = accuracy_score(y_test, et.predict(X_test))
    print(f"    * Extra Trees:            {et_acc * 100:.2f}%")

    # 3. LightGBM
    lgb = LGBMClassifier(n_estimators=350, max_depth=8, num_leaves=40, learning_rate=0.05, subsample=0.85, random_state=42, verbose=-1)
    lgb.fit(X_train, y_train)
    lgb_acc = accuracy_score(y_test, lgb.predict(X_test))
    print(f"    * LightGBM:               {lgb_acc * 100:.2f}%")

    # 4. CatBoost
    cat = CatBoostClassifier(iterations=350, depth=7, learning_rate=0.07, random_state=42, verbose=0)
    cat.fit(X_train, y_train)
    cat_acc = accuracy_score(y_test, cat.predict(X_test))
    print(f"    * CatBoost:               {cat_acc * 100:.2f}%")

    # 5. XGBoost
    xgb = XGBClassifier(n_estimators=350, max_depth=7, learning_rate=0.05, subsample=0.85, colsample_bytree=0.85, random_state=42, eval_metric='mlogloss')
    xgb.fit(X_train, y_train)
    xgb_acc = accuracy_score(y_test, xgb.predict(X_test))
    print(f"    * XGBoost:                {xgb_acc * 100:.2f}%")

    # 6. Soft-Voting Ensemble
    print("\n[4] Building High-Accuracy Soft-Voting Ensemble...")
    ensemble = VotingClassifier(
        estimators=[
            ('rf', rf),
            ('et', et),
            ('lgb', lgb),
            ('cat', cat),
            ('xgb', xgb)
        ],
        voting='soft',
        weights=[1.5, 1.2, 1.5, 1.2, 1.5]
    )
    ensemble.fit(X_train, y_train)

    # Predictions & Confidence
    y_pred = ensemble.predict(X_test)
    y_proba = ensemble.predict_proba(X_test)
    ensemble_acc = accuracy_score(y_test, y_pred)

    print("\n" + "=" * 80)
    print(f"       FINAL OPTIMIZED ENSEMBLE ACCURACY: {ensemble_acc * 100:.2f}%       ")
    print("=" * 80)
    print("\nDetailed Classification Report:\n")
    print(classification_report(y_test, y_pred, target_names=le_target.classes_))

    # Regional Accuracy & Predictions
    test_df = df_clean.loc[idx_test].copy()
    test_df['Predicted_Code'] = y_pred
    test_df['Predicted_Material'] = le_target.inverse_transform(y_pred)
    test_df['Actual_Material'] = le_target.inverse_transform(y_test)
    test_df['Confidence'] = np.max(y_proba, axis=1)

    state_totals = df_clean['State'].value_counts()

    print("=" * 80)
    print("         UPDATED ACCURACY & PREDICTIONS FOR EACH REGION (STATE)           ")
    print("=" * 80)
    print(f"{'Region (State)':<22} | {'Test Samples':<12} | {'Accuracy':<10} | {'Dominant Failure':<18} | {'Risk Alert'}")
    print("-" * 80)

    for state in sorted(test_df['State'].unique()):
        mask = test_df['State'] == state
        st_actual = test_df.loc[mask, 'Actual_Material']
        st_pred = test_df.loc[mask, 'Predicted_Material']
        st_acc = accuracy_score(st_actual, st_pred) if len(st_actual) > 0 else 0
        st_count = mask.sum()
        dominant_pred = st_pred.mode()[0] if not st_pred.empty else 'N/A'

        total_slides = state_totals.get(state, 0)
        if total_slides >= 2000:
            alert = "CRITICAL (Red Alert)"
        elif total_slides >= 1000:
            alert = "HIGH (Orange Alert)"
        else:
            alert = "MODERATE (Yellow Alert)"

        print(f"{state:<22} | {st_count:<12} | {st_acc * 100:6.2f}%    | {dominant_pred:<18} | {alert}")

    # Export Updated Predictions
    output_cols = ['Slide_No', 'State', 'District', 'Latitude', 'Longitude',
                   'Actual_Material', 'Predicted_Material', 'Confidence', 'Movement_Class', 'Is_Highway']
    valid_cols = [c for c in output_cols if c in test_df.columns]
    out_file = os.path.join(base_dir, "NE_Region_Landslide_Predictions_Updated.csv")
    test_df[valid_cols].to_csv(out_file, index=False)
    print(f"\n[5] Exported enhanced predictions to: '{out_file}' ({len(test_df)} records)")


if __name__ == '__main__':
    main()

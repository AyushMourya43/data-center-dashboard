
# ==========================================================
# DATA CENTER INTELLIGENCE PLATFORM
# FastAPI Backend
#
# Data Source:
# Databricks Gold Delta Table
# workspace.iot_db.gold_dc_summary
# ==========================================================

import logging
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from db import get_latest_gold_summary


# ----------------------------------------------------------
# 1. APPLICATION SETUP
# ----------------------------------------------------------

app = FastAPI(
    title="Data Center Intelligence API",
    description=(
        "Backend API for Data Center IoT Monitoring "
        "and Infrastructure Analytics"
    ),
    version="1.0.0"
)

logger = logging.getLogger(__name__)


# ----------------------------------------------------------
# 2. CORS CONFIGURATION
# ----------------------------------------------------------

# Allow our local frontend server to access the API.

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500"
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"]
)


# ----------------------------------------------------------
# 3. HELPER FUNCTIONS
# ----------------------------------------------------------

def safe_int(value):
    if value is None:
        return 0

    return int(value)


def safe_float(value):
    if value is None:
        return 0.0

    return float(value)


def normalize_center(row):
    """
    Convert one Databricks Gold record
    into frontend-friendly JSON fields.
    """

    return {
        "data_center_id": str(
            row["data_center_id"]
        ),

        "city": row.get("city"),

        "region": row.get("region"),

        "process_date": (
            row["process_date"].isoformat()
            if row.get("process_date")
            else None
        ),

        "total_readings": safe_int(
            row.get("total_readings")
        ),

        "average_temperature": safe_float(
            row.get("average_temperature")
        ),

        "maximum_temperature": safe_float(
            row.get("maximum_temperature")
        ),

        "average_humidity": safe_float(
            row.get("average_humidity")
        ),

        "average_power_kw": safe_float(
            row.get("average_power_kw")
        ),

        "critical_readings": safe_int(
            row.get("critical_readings")
        ),

        "warning_readings": safe_int(
            row.get("warning_readings")
        ),

        "cooling_failures": safe_int(
            row.get("cooling_failures")
        ),

        "cooling_degraded_readings": safe_int(
            row.get("cooling_degraded_readings")
        ),

        "offline_sensor_readings": safe_int(
            row.get("offline_sensor_readings")
        )
    }


def load_gold_data():
    """
    Read the latest daily Gold summary
    from Databricks.
    """

    try:
        records = get_latest_gold_summary()

        return [
            normalize_center(row)
            for row in records
        ]

    except Exception as error:
        logger.error(
            "Databricks Gold query failed: %s",
            type(error).__name__
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Databricks data is temporarily "
                "unavailable."
            )
        ) from error


# ----------------------------------------------------------
# 4. ROOT ENDPOINT
# ----------------------------------------------------------

@app.get("/")
def root():
    return {
        "application": "Data Center Intelligence",
        "version": "1.0.0",
        "status": "API Running",
        "documentation": "/docs"
    }


# ----------------------------------------------------------
# 5. HEALTH CHECK ENDPOINT
# ----------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "Data Center Intelligence API",
        "timestamp": datetime.now(
            timezone.utc
        ).isoformat()
    }


# ----------------------------------------------------------
# 6. DATA CENTERS ENDPOINT
# ----------------------------------------------------------

@app.get("/api/data-centers")
def get_data_centers():

    centers = load_gold_data()

    return {
        "source": "databricks_gold",
        "data_type": "daily_aggregate",
        "count": len(centers),
        "process_date": (
            centers[0]["process_date"]
            if centers
            else None
        ),
        "data_centers": centers
    }


# ----------------------------------------------------------
# 7. DASHBOARD OVERVIEW ENDPOINT
# ----------------------------------------------------------

@app.get("/api/overview")
def get_overview():

    centers = load_gold_data()

    if not centers:
        return {
            "source": "databricks_gold",
            "data_type": "daily_aggregate",
            "process_date": None,
            "summary": {},
            "data_centers": []
        }

    # Total daily sensor readings
    total_readings = sum(
        center["total_readings"]
        for center in centers
    )

    # Reading-weighted average temperature
    weighted_temp_sum = sum(
        center["average_temperature"]
        * center["total_readings"]
        for center in centers
    )

    average_temperature = (
        weighted_temp_sum / total_readings
        if total_readings > 0
        else 0
    )

    # Combined average power across centers.
    # This is kW, NOT energy consumption (kWh).
    combined_average_power_kw = sum(
        center["average_power_kw"]
        for center in centers
    )

    total_critical = sum(
        center["critical_readings"]
        for center in centers
    )

    total_warnings = sum(
        center["warning_readings"]
        for center in centers
    )

    total_cooling_failures = sum(
        center["cooling_failures"]
        for center in centers
    )

    total_cooling_degraded = sum(
        center["cooling_degraded_readings"]
        for center in centers
    )

    total_offline = sum(
        center["offline_sensor_readings"]
        for center in centers
    )

    summary = {
        "total_data_centers": len(centers),

        "total_readings": total_readings,

        "average_temperature": round(
            average_temperature, 2
        ),

        "combined_average_power_kw": round(
            combined_average_power_kw, 2
        ),

        "critical_readings": total_critical,

        "warning_readings": total_warnings,

        "cooling_failures": total_cooling_failures,

        "cooling_degraded_readings": (
            total_cooling_degraded
        ),

        "offline_sensor_readings": total_offline
    }

    return {
        "source": "databricks_gold",
        "data_type": "daily_aggregate",
        "process_date": centers[0]["process_date"],
        "summary": summary,
        "data_centers": centers
    }


# ----------------------------------------------------------
# 8. STARTUP INFORMATION
# ----------------------------------------------------------

# Run using:
#
# uvicorn main:app --reload --port 8000
#
# API Documentation:
# http://localhost:8000/docs
#
# Dashboard API:
# http://localhost:8000/api/overview
# ==========================================================

# ==========================================================
# 9. DATA CENTER RISK INTELLIGENCE
# ==========================================================

def calculate_percentage(part, total):
    """
    Calculate percentage safely.
    """
    if not total or total <= 0:
        return 0.0

    return round((part / total) * 100, 2)


@app.get("/api/risk-analysis")
def get_risk_analysis():
    """
    Analyze the latest daily Gold data.

    Rankings are based on critical reading rates.
    This is historical daily analysis, not live status.
    """

    centers = load_gold_data()

    risk_results = []

    for center in centers:

        total = center["total_readings"]

        critical_rate = calculate_percentage(
            center["critical_readings"],
            total
        )

        warning_rate = calculate_percentage(
            center["warning_readings"],
            total
        )

        cooling_failure_rate = calculate_percentage(
            center["cooling_failures"],
            total
        )

        offline_rate = calculate_percentage(
            center["offline_sensor_readings"],
            total
        )

        risk_results.append({
            "data_center_id": center["data_center_id"],
            "city": center["city"],
            "region": center["region"],

            "total_readings": total,

            "critical_readings": center["critical_readings"],
            "critical_rate_pct": critical_rate,

            "warning_readings": center["warning_readings"],
            "warning_rate_pct": warning_rate,

            "cooling_failures": center["cooling_failures"],
            "cooling_failure_rate_pct": cooling_failure_rate,

            "offline_sensor_readings": center["offline_sensor_readings"],
            "offline_sensor_rate_pct": offline_rate
        })

    # Highest critical-reading rate first.
    # Raw rate is used so ranking doesn't depend
    # on already-rounded percentages.

    risk_results.sort(
        key=lambda center: (
            center["critical_readings"]
            / center["total_readings"]
            if center["total_readings"] > 0
            else 0
        ),
        reverse=True
    )

    for index, center in enumerate(risk_results, start=1):
        center["risk_rank"] = index

    return {
        "source": "databricks_gold",
        "analysis_type": "daily_historical_risk",
        "process_date": (
            centers[0]["process_date"]
            if centers
            else None
        ),
        "ranking_method": "critical_reading_rate_desc",
        "total_data_centers": len(risk_results),
        "data_centers": risk_results
    }

# ==========================================================
# DAY-OVER-DAY INTELLIGENCE API
# ==========================================================

from db import get_daily_comparison


@app.get("/api/intelligence/daily-comparison")
def daily_intelligence():

    # Fetch actual Databricks Gold comparison
    centers = get_daily_comparison()

    if not centers:
        return {
            "source": "databricks_gold",
            "status": "no_comparison_available",
            "message": "No consecutive daily data available.",
            "total_data_centers": 0,
            "data_centers": []
        }

    return {
        "source": "databricks_gold",
        "status": "success",
        "analysis_type": "day_over_day",
        "process_date": centers[0]["process_date"],
        "previous_date": centers[0]["previous_date"],
        "total_data_centers": len(centers),
        "data_centers": centers
    }


# ==========================================================
# RULE-BASED ANOMALY DETECTION
#
# Uses existing Day-over-Day Intelligence data.
# Thresholds are examples for this prototype,
# not certified equipment safety limits.
# ==========================================================

@app.get("/api/intelligence/anomalies")
def detect_anomalies():

    # Fetch existing daily comparison from Databricks
    centers = get_daily_comparison()

    results = []

    for center in centers:

        temp_change = center["temperature_change_c"]
        critical_change = center["critical_rate_change_pp"]
        cooling_change = center["cooling_rate_change_pp"]

        # --------------------------------------------------
        # 1. CHECK RULES
        # --------------------------------------------------

        reasons = []

        if temp_change is not None and temp_change >= 0.5:
            reasons.append("Temperature increased by at least 0.5°C")

        if critical_change is not None and critical_change >= 0.05:
            reasons.append("Critical reading rate increased by at least 0.05 pp")

        if cooling_change is not None and cooling_change >= 0.15:
            reasons.append("Cooling degradation rate increased by at least 0.15 pp")

        # --------------------------------------------------
        # 2. DETERMINE INVESTIGATION PRIORITY
        # --------------------------------------------------

        if len(reasons) >= 2:
            priority = "HIGH"

        elif len(reasons) == 1:
            priority = "REVIEW"

        else:
            priority = "NO_RULE_TRIGGERED"

        # --------------------------------------------------
        # 3. STORE RESULT
        # --------------------------------------------------

        results.append({
            "data_center_id": center["data_center_id"],
            "city": center["city"],

            "temperature_change_c": temp_change,
            "critical_rate_change_pp": critical_change,
            "cooling_rate_change_pp": cooling_change,

            "priority": priority,
            "rules_triggered": len(reasons),
            "reasons": reasons
        })

    # ------------------------------------------------------
    # 4. ORDER BY INVESTIGATION PRIORITY
    # ------------------------------------------------------

    priority_order = {
        "HIGH": 0,
        "REVIEW": 1,
        "NO_RULE_TRIGGERED": 2
    }

    results.sort(
        key=lambda center: (
            priority_order[center["priority"]],
            -center["rules_triggered"],
            center["data_center_id"]
        )
    )

    return {
        "source": "databricks_gold",
        "analysis_type": "rule_based_change_detection",
        "process_date": (
            str(centers[0]["process_date"])
            if centers else None
        ),
        "previous_date": (
            str(centers[0]["previous_date"])
            if centers else None
        ),

        "total_data_centers": len(results),

        "high_priority": sum(
            1 for c in results
            if c["priority"] == "HIGH"
        ),

        "review_required": sum(
            1 for c in results
            if c["priority"] == "REVIEW"
        ),

        "data_centers": results
    }

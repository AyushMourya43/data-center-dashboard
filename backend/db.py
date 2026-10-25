
# ==========================================================
# DATA CENTER INTELLIGENCE PLATFORM
# Databricks Database Connection
#
# Source:
# workspace.iot_db.gold_dc_summary
#
# Features:
# 1. Secure Databricks connection
# 2. Connection testing
# 3. Latest Gold summary
# 4. Day-over-Day Intelligence
#
# Credentials are loaded from .env.
# Never expose Databricks tokens to the frontend.
# ==========================================================

import os
from pathlib import Path

from dotenv import load_dotenv
from databricks import sql


# ----------------------------------------------------------
# 1. LOAD ENVIRONMENT VARIABLES
# ----------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")


# ----------------------------------------------------------
# 2. DATABASE CONFIGURATION
# ----------------------------------------------------------

TABLE_NAME = "workspace.iot_db.gold_dc_summary"


def get_databricks_config():
    """
    Read Databricks credentials from environment variables.
    """

    server_hostname = os.getenv(
        "DATABRICKS_SERVER_HOSTNAME", ""
    ).strip()

    http_path = os.getenv(
        "DATABRICKS_HTTP_PATH", ""
    ).strip()

    access_token = os.getenv(
        "DATABRICKS_TOKEN", ""
    ).strip()

    server_hostname = (
        server_hostname
        .removeprefix("https://")
        .removeprefix("http://")
        .rstrip("/")
    )

    missing = []

    if not server_hostname:
        missing.append("DATABRICKS_SERVER_HOSTNAME")

    if not http_path:
        missing.append("DATABRICKS_HTTP_PATH")

    if not access_token:
        missing.append("DATABRICKS_TOKEN")

    if missing:
        raise RuntimeError(
            "Missing Databricks configuration: "
            + ", ".join(missing)
        )

    return {
        "server_hostname": server_hostname,
        "http_path": http_path,
        "access_token": access_token,
    }


# ----------------------------------------------------------
# 3. CREATE DATABRICKS CONNECTION
# ----------------------------------------------------------

def get_connection():
    """
    Create a new Databricks SQL connection.
    """

    config = get_databricks_config()

    return sql.connect(
        server_hostname=config["server_hostname"],
        http_path=config["http_path"],
        access_token=config["access_token"],
    )


# ----------------------------------------------------------
# 4. TEST DATABASE CONNECTION
# ----------------------------------------------------------

def test_connection():
    """
    Test SQL connectivity.
    """

    connection = get_connection()

    try:
        cursor = connection.cursor()

        try:
            cursor.execute(
                "SELECT 1 AS connection_ok"
            )

            result = cursor.fetchone()

            return {
                "connected": (
                    result is not None
                    and result[0] == 1
                ),
                "message": (
                    "Databricks SQL connection successful"
                ),
            }

        finally:
            cursor.close()

    finally:
        connection.close()


# ----------------------------------------------------------
# 5. FETCH LATEST GOLD SUMMARY
# ----------------------------------------------------------

def get_latest_gold_summary():
    """
    Fetch all data centers for the latest process_date.

    Existing dashboard functionality remains unchanged.
    """

    query = f"""
        SELECT *
        FROM {TABLE_NAME}
        WHERE process_date = (
            SELECT MAX(process_date)
            FROM {TABLE_NAME}
        )
        ORDER BY data_center_id
    """

    connection = get_connection()

    try:
        cursor = connection.cursor()

        try:
            cursor.execute(query)

            columns = [
                column[0]
                for column in cursor.description
            ]

            rows = cursor.fetchall()

            results = []

            for row in rows:
                record = dict(zip(columns, row))
                results.append(record)

            return results

        finally:
            cursor.close()

    finally:
        connection.close()


# ----------------------------------------------------------
# 6. DAY-OVER-DAY INTELLIGENCE
# ----------------------------------------------------------

def get_daily_comparison():
    """
    Compare the latest Gold date with the preceding date.

    Analyzes:
    - Average temperature change (Celsius)
    - Critical reading rate change (percentage points)
    - Cooling degradation rate change (percentage points)

    Only compares consecutive calendar days.

    This is daily change detection, not statistical
    anomaly detection or root cause confirmation.
    """

    query = f"""
        WITH daily_metrics AS (

            SELECT
                CAST(process_date AS DATE) AS process_date,

                data_center_id,
                city,

                total_readings,

                CAST(
                    average_temperature AS DOUBLE
                ) AS average_temperature,

                CASE
                    WHEN total_readings > 0 THEN
                        100.0 * critical_readings
                        / total_readings
                    ELSE NULL
                END AS critical_rate_pct,

                CASE
                    WHEN total_readings > 0 THEN
                        100.0 * cooling_degraded_readings
                        / total_readings
                    ELSE NULL
                END AS cooling_degraded_rate_pct

            FROM {TABLE_NAME}
        ),

        historical_comparison AS (

            SELECT
                *,

                LAG(process_date) OVER (
                    PARTITION BY data_center_id
                    ORDER BY process_date
                ) AS previous_date,

                LAG(average_temperature) OVER (
                    PARTITION BY data_center_id
                    ORDER BY process_date
                ) AS previous_temperature,

                LAG(critical_rate_pct) OVER (
                    PARTITION BY data_center_id
                    ORDER BY process_date
                ) AS previous_critical_rate_pct,

                LAG(cooling_degraded_rate_pct) OVER (
                    PARTITION BY data_center_id
                    ORDER BY process_date
                ) AS previous_cooling_rate_pct

            FROM daily_metrics
        )

        SELECT

            data_center_id,
            city,

            CAST(
                process_date AS STRING
            ) AS process_date,

            CAST(
                previous_date AS STRING
            ) AS previous_date,

            total_readings,

            ROUND(
                previous_temperature, 3
            ) AS previous_temperature_c,

            ROUND(
                average_temperature, 3
            ) AS current_temperature_c,

            ROUND(
                average_temperature
                - previous_temperature,
                3
            ) AS temperature_change_c,

            ROUND(
                previous_critical_rate_pct, 3
            ) AS previous_critical_rate_pct,

            ROUND(
                critical_rate_pct, 3
            ) AS current_critical_rate_pct,

            ROUND(
                critical_rate_pct
                - previous_critical_rate_pct,
                3
            ) AS critical_rate_change_pp,

            ROUND(
                previous_cooling_rate_pct, 3
            ) AS previous_cooling_rate_pct,

            ROUND(
                cooling_degraded_rate_pct, 3
            ) AS current_cooling_rate_pct,

            ROUND(
                cooling_degraded_rate_pct
                - previous_cooling_rate_pct,
                3
            ) AS cooling_rate_change_pp

        FROM historical_comparison

        WHERE
            DATEDIFF(
                process_date,
                previous_date
            ) = 1

            AND process_date = (
                SELECT MAX(
                    CAST(process_date AS DATE)
                )
                FROM {TABLE_NAME}
            )

        ORDER BY
            critical_rate_change_pp DESC,
            data_center_id
    """

    connection = get_connection()

    try:
        cursor = connection.cursor()

        try:
            cursor.execute(query)

            columns = [
                column[0]
                for column in cursor.description
            ]

            rows = cursor.fetchall()

            results = []

            for row in rows:
                record = dict(zip(columns, row))
                results.append(record)

            return results

        finally:
            cursor.close()

    finally:
        connection.close()


# ----------------------------------------------------------
# 7. RUN DATABASE TESTS
# ----------------------------------------------------------

if __name__ == "__main__":

    try:
        print("\nTesting Databricks connection...")

        result = test_connection()

        print(result)

        print("\nFetching latest Gold summary...")

        records = get_latest_gold_summary()

        print(
            f"Gold records fetched: {len(records)}"
        )

        for record in records[:2]:
            print(record)

        print("\nFetching Day-over-Day Intelligence...")

        comparisons = get_daily_comparison()

        print(
            f"Data centers compared: {len(comparisons)}"
        )

        for center in comparisons:

            print(
                f"\n{center['data_center_id']}"
                f" - {center['city']}"
            )

            print(
                "Date:",
                center["process_date"]
            )

            print(
                "Temperature Change:",
                center["temperature_change_c"],
                "°C"
            )

            print(
                "Critical Rate Change:",
                center["critical_rate_change_pp"],
                "pp"
            )

            print(
                "Cooling Rate Change:",
                center["cooling_rate_change_pp"],
                "pp"
            )

    except Exception as error:

        print(
            "\nDatabase test failed:",
            type(error).__name__,
            str(error)
        )

        raise


/* ============================================================
   DATA CENTER INTELLIGENCE PLATFORM
   COMPLETE FRONTEND JAVASCRIPT

   Features:
   - Actual Databricks Gold data through FastAPI
   - Dashboard Overview
   - Premium Data Centers Page
   - Risk Intelligence / Alerts Page
   - Light and Dark Mode
   - Responsive Charts
   - Search and Navigation

   Backend:
   http://127.0.0.1:8000

   Frontend:
   http://127.0.0.1:5500

   Data:
   Daily aggregate metrics from Databricks Gold.
============================================================ */

"use strict";

// ============================================================
// 01. API CONFIGURATION
// ============================================================


function dashboardApi(endpoint) {
    const paths = {
        overview: "/api/overview",
        risk: "/api/risk-analysis",
        comparison: "/api/intelligence/daily-comparison",
        anomalies: "/api/intelligence/anomalies"
    };

    const isLocal = [
        "localhost",
        "127.0.0.1"
    ].includes(window.location.hostname);

    if (isLocal) {
        return "http://127.0.0.1:8000" + paths[endpoint];
    }

    return "/api/proxy?endpoint=" + endpoint;
}

const API = {
    overview: dashboardApi("overview"),
    risk: dashboardApi("risk")
};

// ============================================================
// 02. APPLICATION STATE
// ============================================================

let dataCenters = [];
let dashboardSummary = {};
let processDate = null;
let riskData = null;

let currentTheme = "light";
let currentPage = "overview";
let currentSearch = "";
let selectedCenterId = null;

let overviewCharts = [];
let detailCharts = [];

let dashboardLoading = false;
let riskLoading = false;

// ============================================================
// 03. GENERAL HELPERS
// ============================================================

function byId(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const element = byId(id);

    if (element) {
        element.textContent = String(value);
    }
}

function createElement(tag, className = "", text = null) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== null) {
        element.textContent = String(text);
    }

    return element;
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString("en-IN");
}

function compactNumber(value) {
    return new Intl.NumberFormat("en-IN", {
        notation: "compact",
        maximumFractionDigits: 2
    }).format(Number(value || 0));
}

function formatDate(dateString) {
    if (!dateString) {
        return "—";
    }

    return new Date(
        `${dateString}T00:00:00`
    ).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function normalizeCenterId(id) {
    const raw = String(id || "");

    const match = raw.match(/^DC-?(\d+)$/i);

    if (!match) {
        return raw;
    }

    return `DC-${match[1].padStart(2, "0")}`;
}

function percentage(part, total) {
    if (!total || total <= 0) {
        return 0;
    }

    return Number(part || 0) / total * 100;
}

function getCenter(id) {
    return dataCenters.find(
        center => center.id === id
    );
}

function getCssColor(variable, fallback) {
    return getComputedStyle(
        document.documentElement
    ).getPropertyValue(variable).trim() || fallback;
}

function getChartColors() {
    return {
        blue: getCssColor("--primary-blue", "#0867ee"),
        text: getCssColor("--text-secondary", "#57749f"),
        grid: getCssColor(
            "--grid-color",
            "rgba(58,115,191,.12)"
        ),
        red: getCssColor("--red", "#ff515b"),
        yellow: getCssColor("--yellow", "#ffae19"),
        green: getCssColor("--green", "#09b987"),
        purple: "#9666f5",
        cyan: "#12bcd4",
        gold: "#f4b544"
    };
}

// ============================================================
// 04. NORMALIZE DATABRICKS RECORDS
// ============================================================

function normalizeApiCenter(record) {
    return {
        rawId: record.data_center_id,

        id: normalizeCenterId(
            record.data_center_id
        ),

        city: record.city || "Unknown",

        region: record.region || "Unknown",

        date: record.process_date,

        readings: Number(
            record.total_readings || 0
        ),

        temperature: Number(
            record.average_temperature || 0
        ),

        maxTemperature: Number(
            record.maximum_temperature || 0
        ),

        humidity: Number(
            record.average_humidity || 0
        ),

        power: Number(
            record.average_power_kw || 0
        ),

        critical: Number(
            record.critical_readings || 0
        ),

        warning: Number(
            record.warning_readings || 0
        ),

        coolingFailures: Number(
            record.cooling_failures || 0
        ),

        coolingDegraded: Number(
            record.cooling_degraded_readings || 0
        ),

        offlineSensors: Number(
            record.offline_sensor_readings || 0
        )
    };
}

// ============================================================
// 05. THEME MANAGEMENT
// ============================================================

function applyTheme(theme) {
    currentTheme =
        theme === "dark" ? "dark" : "light";

    document.documentElement.setAttribute(
        "data-theme",
        currentTheme
    );

    byId("lightModeButton")?.classList.toggle(
        "active",
        currentTheme === "light"
    );

    byId("darkModeButton")?.classList.toggle(
        "active",
        currentTheme === "dark"
    );

    byId("lightModeButton")?.setAttribute(
        "aria-pressed",
        String(currentTheme === "light")
    );

    byId("darkModeButton")?.setAttribute(
        "aria-pressed",
        String(currentTheme === "dark")
    );

    try {
        localStorage.setItem(
            "dc-intelligence-theme",
            currentTheme
        );
    } catch (error) {
        console.warn("Theme could not be saved.");
    }

    updateChartThemes();
}

function initializeTheme() {
    let savedTheme = "light";

    try {
        savedTheme =
            localStorage.getItem(
                "dc-intelligence-theme"
            ) || "light";
    } catch (error) {
        // Use light theme if storage is unavailable.
    }

    applyTheme(savedTheme);

    byId("lightModeButton")?.addEventListener(
        "click",
        () => applyTheme("light")
    );

    byId("darkModeButton")?.addEventListener(
        "click",
        () => applyTheme("dark")
    );
}

// ============================================================
// 06. SMALL NOTIFICATION
// ============================================================

function showToast(message) {
    byId("dashboardToast")?.remove();

    const toast = createElement(
        "div",
        "",
        message
    );

    toast.id = "dashboardToast";

    toast.setAttribute("role", "status");

    Object.assign(toast.style, {
        position: "fixed",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "12px 18px",
        maxWidth: "90vw",
        borderRadius: "10px",
        background: "#102b48",
        color: "#ffffff",
        fontSize: "12px",
        textAlign: "center",
        zIndex: "9999",
        boxShadow: "0 10px 26px rgba(0,0,0,.2)"
    });

    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3500);
}

// ============================================================
// 07. PREMIUM PAGE STYLES
// ============================================================

// All premium styles are included here.
// No need to edit style.css separately.

function injectPremiumStyles() {
    if (byId("premiumPagesStyle")) {
        return;
    }

    const style = document.createElement("style");

    style.id = "premiumPagesStyle";

    style.textContent = `

    /* ----------------------------------------
       PAGE FOUNDATION
    ----------------------------------------- */

    .secondary-page-content.premium-page-active {
        display: block;
        padding: 22px;
        text-align: left;
        background: var(--card-bg);
        min-height: 400px;
        align-items: initial;
        justify-content: initial;
    }

    .premium-page {
        width: 100%;
        color: var(--text-primary);
    }

    .premium-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 15px;
        margin-bottom: 19px;
    }

    .premium-toolbar p {
        color: var(--text-secondary);
        font-size: 11px;
        line-height: 1.8;
        max-width: 650px;
    }

    .premium-refresh {
        padding: 11px 16px;
        border: none;
        border-radius: 10px;
        background: linear-gradient(
            135deg,
            #0867ee,
            #328bff
        );
        color: white;
        font-size: 11px;
        font-weight: 800;
        box-shadow: 0 7px 18px rgba(8,103,238,.18);
        transition: transform .2s, box-shadow .2s;
    }

    .premium-refresh:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 24px rgba(8,103,238,.25);
    }

    .premium-refresh:disabled {
        opacity: .65;
        cursor: wait;
    }

    .premium-section-title {
        font-size: 17px;
        font-weight: 800;
        margin: 24px 0 14px;
        color: var(--text-primary);
    }

    .premium-muted {
        color: var(--text-secondary);
        font-size: 11px;
        line-height: 1.8;
    }

    /* ----------------------------------------
       SUMMARY CARDS
    ----------------------------------------- */

    .premium-summary-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 25px;
    }

    .premium-summary-card {
        position: relative;
        overflow: hidden;
        padding: 21px 19px;
        min-width: 0;
        border: 1px solid var(--border-color);
        border-radius: 14px;
        background:
            linear-gradient(
                125deg,
                rgba(44,128,255,.08),
                transparent 85%
            ),
            var(--card-bg);
        box-shadow: 0 7px 22px rgba(24,73,142,.05);
        transition: transform .2s;
    }

    .premium-summary-card:hover {
        transform: translateY(-3px);
    }

    .premium-summary-card::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: #237cff;
    }

    .premium-summary-card:nth-child(2) {
        background:
            linear-gradient(
                125deg,
                rgba(141,91,245,.09),
                transparent 85%
            ),
            var(--card-bg);
    }

    .premium-summary-card:nth-child(2)::before {
        background: #9666f5;
    }

    .premium-summary-card:nth-child(3) {
        background:
            linear-gradient(
                125deg,
                rgba(244,181,68,.11),
                transparent 85%
            ),
            var(--card-bg);
    }

    .premium-summary-card:nth-child(3)::before {
        background: #f4b544;
    }

    .premium-summary-card span {
        display: block;
        font-size: 11px;
        color: var(--text-secondary);
    }

    .premium-summary-card strong {
        display: block;
        font-size: clamp(20px, 2.2vw, 27px);
        margin-top: 10px;
        font-weight: 800;
        color: var(--text-primary);
        overflow-wrap: anywhere;
    }

    .premium-summary-card small {
        display: block;
        font-size: 10px;
        color: var(--text-muted);
        margin-top: 7px;
    }

    /* ----------------------------------------
       DATA CENTER CARDS
    ----------------------------------------- */

    .dcx-center-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 12px;
    }

    .dcx-center-card {
        width: 100%;
        min-width: 0;
        position: relative;
        overflow: hidden;
        padding: 16px 14px;
        border: 1px solid var(--border-color);
        border-radius: 13px;
        background:
            linear-gradient(
                145deg,
                rgba(35,124,255,.035),
                transparent 85%
            ),
            var(--card-bg);
        color: var(--text-primary);
        text-align: left;
        box-shadow: 0 6px 18px rgba(21,71,133,.04);
        transition:
            transform .22s,
            border-color .22s,
            box-shadow .22s;
    }

    .dcx-center-card:hover {
        transform: translateY(-4px);
        border-color: var(--primary-blue);
        box-shadow: 0 12px 27px rgba(8,103,238,.12);
    }

    .dcx-center-card.selected {
        border: 2px solid var(--primary-blue);
        background:
            linear-gradient(
                145deg,
                rgba(25,113,244,.12),
                rgba(244,181,68,.045)
            ),
            var(--card-bg);
        box-shadow: 0 10px 25px rgba(8,103,238,.14);
    }

    .dcx-center-card:focus-visible {
        outline: 2px solid var(--primary-blue);
        outline-offset: 2px;
    }

    .dcx-center-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 7px;
    }

    .dcx-center-card-header strong {
        font-size: 13px;
        font-weight: 800;
    }

    .dcx-center-icon {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        background: rgba(35,124,255,.10);
        color: var(--primary-blue);
        display: grid;
        place-items: center;
        font-size: 13px;
    }

    .dcx-center-card.selected .dcx-center-icon {
        background: var(--primary-blue);
        color: #ffffff;
    }

    .dcx-center-city {
        display: block;
        margin-top: 9px;
        font-size: 10px;
        color: var(--text-secondary);
    }

    .dcx-center-temperature {
        display: block;
        margin-top: 13px;
        color: var(--text-primary);
        font-size: 20px;
        font-weight: 800;
    }

    .dcx-center-caption {
        display: block;
        margin-top: 5px;
        font-size: 9px;
        color: var(--text-muted);
    }

    .dcx-center-region {
        display: inline-block;
        margin-top: 11px;
        padding: 5px 8px;
        border-radius: 6px;
        color: var(--primary-blue);
        background: rgba(35,124,255,.09);
        font-size: 9px;
        font-weight: 700;
    }

    /* ----------------------------------------
       SELECTED CENTER DETAIL
    ----------------------------------------- */

    .dcx-detail-panel {
        margin-top: 22px;
        padding: 22px;
        border-radius: 15px;
        border: 1px solid var(--border-color);
        background:
            linear-gradient(
                150deg,
                rgba(41,121,243,.045),
                transparent 75%
            ),
            var(--card-bg);
        box-shadow: 0 10px 28px rgba(27,75,139,.045);
    }

    .dcx-detail-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        padding-bottom: 18px;
        border-bottom: 1px solid var(--border-color);
    }

    .dcx-detail-header h3 {
        color: var(--text-primary);
        font-size: 19px;
        font-weight: 800;
    }

    .dcx-detail-header p {
        margin-top: 7px;
        font-size: 11px;
        color: var(--text-secondary);
    }

    .dcx-rank-label {
        padding: 10px 13px;
        border: 1px solid rgba(35,124,255,.18);
        border-radius: 9px;
        color: var(--primary-blue);
        background: rgba(35,124,255,.09);
        font-size: 10px;
        font-weight: 800;
    }

    .dcx-detail-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 19px;
    }

    .dcx-detail-item {
        min-width: 0;
        padding: 16px 14px;
        border-radius: 11px;
        border: 1px solid var(--border-color);
        background: var(--card-bg);
        transition: transform .2s, border-color .2s;
    }

    .dcx-detail-item:hover {
        transform: translateY(-2px);
        border-color: rgba(35,124,255,.35);
    }

    .dcx-detail-item:nth-child(4n+1) {
        background:
            linear-gradient(
                125deg,
                rgba(35,124,255,.075),
                transparent
            ),
            var(--card-bg);
    }

    .dcx-detail-item:nth-child(4n+2) {
        background:
            linear-gradient(
                125deg,
                rgba(20,190,190,.065),
                transparent
            ),
            var(--card-bg);
    }

    .dcx-detail-item:nth-child(4n+3) {
        background:
            linear-gradient(
                125deg,
                rgba(150,102,245,.075),
                transparent
            ),
            var(--card-bg);
    }

    .dcx-detail-item:nth-child(4n+4) {
        background:
            linear-gradient(
                125deg,
                rgba(244,181,68,.08),
                transparent
            ),
            var(--card-bg);
    }

    .dcx-detail-item span {
        display: block;
        font-size: 10px;
        line-height: 1.5;
        color: var(--text-secondary);
    }

    .dcx-detail-item strong {
        display: block;
        margin-top: 8px;
        color: var(--text-primary);
        font-size: 18px;
        font-weight: 800;
        overflow-wrap: anywhere;
    }

    .dcx-detail-item strong.red-value {
        color: var(--red);
    }

    .dcx-detail-item strong.gold-value {
        color: var(--yellow);
    }

    .dcx-detail-item strong.blue-value {
        color: var(--primary-blue);
    }

    /* ----------------------------------------
       COMPARISON CHARTS
    ----------------------------------------- */

    .dcx-comparison-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 13px;
        margin-top: 16px;
    }

    .dcx-chart-card {
        min-width: 0;
        padding: 17px;
        border: 1px solid var(--border-color);
        border-radius: 13px;
        background: var(--card-bg);
        box-shadow: 0 8px 20px rgba(24,73,142,.04);
    }

    .dcx-chart-card:nth-child(1) {
        border-top: 3px solid #2385ff;
    }

    .dcx-chart-card:nth-child(2) {
        border-top: 3px solid #13b7c8;
    }

    .dcx-chart-card:nth-child(3) {
        border-top: 3px solid #f4b544;
    }

    .dcx-chart-card h4 {
        font-size: 12px;
        font-weight: 800;
        color: var(--text-primary);
    }

    .dcx-chart-card p {
        margin-top: 5px;
        font-size: 10px;
        color: var(--text-secondary);
    }

    .dcx-chart-wrap {
        position: relative;
        height: 210px;
        margin-top: 13px;
    }

    .dcx-chart-wrap canvas {
        display: block;
        max-width: 100%;
    }

    /* ----------------------------------------
       RISK INTELLIGENCE TABLE
    ----------------------------------------- */

    .riskx-table-wrapper {
        width: 100%;
        overflow-x: auto;
    }

    .riskx-table {
        width: 100%;
        border-collapse: collapse;
    }

    .riskx-table th {
        padding: 14px 12px;
        background: var(--card-subtle);
        color: var(--text-secondary);
        font-size: 10px;
        text-align: left;
        white-space: nowrap;
    }

    .riskx-table td {
        padding: 15px 12px;
        border-bottom: 1px solid var(--border-color);
        color: var(--text-primary);
        font-size: 11px;
        white-space: nowrap;
    }

    .riskx-table tbody tr:hover {
        background: var(--card-hover);
    }

    .riskx-name {
        font-size: 12px;
        font-weight: 800;
    }

    .riskx-city {
        display: block;
        margin-top: 5px;
        font-size: 10px;
        color: var(--text-secondary);
    }

    .riskx-rank {
        font-weight: 800;
        color: var(--primary-blue);
    }

    .riskx-bar-track {
        width: 120px;
        height: 7px;
        border-radius: 20px;
        overflow: hidden;
        margin-top: 8px;
        background: var(--border-color);
    }

    .riskx-bar-fill {
        height: 100%;
        border-radius: 20px;
        background: linear-gradient(
            90deg,
            #176eff,
            #4aaaff
        );
    }

    .riskx-table tbody tr:first-child .riskx-bar-fill {
        background: linear-gradient(
            90deg,
            #f29a18,
            #ffd067
        );
    }

    .premium-page-note {
        margin-top: 20px;
        padding: 13px 15px;
        border-left: 3px solid var(--primary-blue);
        border-radius: 8px;
        background: var(--card-subtle);
        color: var(--text-secondary);
        font-size: 10px;
        line-height: 1.8;
    }

    .premium-error {
        color: var(--red);
        font-size: 12px;
        padding: 18px 0;
    }

    /* ----------------------------------------
       DARK MODE
    ----------------------------------------- */

    html[data-theme="dark"] .premium-summary-card,
    html[data-theme="dark"] .dcx-center-card,
    html[data-theme="dark"] .dcx-detail-panel,
    html[data-theme="dark"] .dcx-chart-card {
        box-shadow: 0 8px 26px rgba(0,0,0,.13);
    }

    html[data-theme="dark"] .dcx-center-card.selected {
        box-shadow: 0 0 0 1px rgba(53,151,255,.17),
                    0 10px 25px rgba(0,0,0,.18);
    }

    html[data-theme="dark"] .dcx-detail-item {
        border-color: var(--border-color);
    }

    /* ----------------------------------------
       RESPONSIVENESS
    ----------------------------------------- */

    @media (max-width: 1200px) {
        .dcx-center-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .dcx-comparison-grid {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 750px) {
        .premium-summary-grid {
            grid-template-columns: 1fr;
        }

        .dcx-center-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .dcx-detail-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .dcx-detail-panel {
            padding: 14px;
        }

        .secondary-page-content.premium-page-active {
            padding: 14px;
        }
    }

    @media (max-width: 420px) {
        .dcx-center-grid {
            grid-template-columns: 1fr;
        }

        .dcx-detail-grid {
            grid-template-columns: 1fr;
        }
    }

    `;

    document.head.appendChild(style);
}

// ============================================================
// 08. OVERVIEW — KPI CARDS
// ============================================================

function updateOverviewKPIs() {
    const summary = dashboardSummary;

    setText(
        "totalReadings",
        compactNumber(summary.total_readings)
    );

    setText(
        "totalDataCenters",
        summary.total_data_centers || 0
    );

    setText(
        "avgTemperature",
        Number(
            summary.average_temperature || 0
        ).toFixed(2) + "°C"
    );

    setText(
        "totalPower",
        Number(
            summary.combined_average_power_kw || 0
        ).toFixed(2) + " kW"
    );

    setText(
        "coolingEfficiency",
        compactNumber(
            summary.cooling_degraded_readings
        )
    );

    setText(
        "criticalAlerts",
        compactNumber(
            summary.critical_readings
        )
    );

    function changeLabel(valueId, label, description) {
        const card = byId(valueId)?.closest(".kpi-card");

        if (!card) return;

        const heading = card.querySelector("h3");
        const subtitle = card.querySelector(
            ".kpi-description"
        );

        if (heading) heading.textContent = label;

        if (subtitle) {
            subtitle.textContent = description;
            subtitle.classList.remove("positive");
        }
    }

    changeLabel(
        "totalReadings",
        "Total Sensor Readings",
        "Latest daily Gold summary"
    );

    changeLabel(
        "totalDataCenters",
        "Data Centers",
        "Monitored Indian locations"
    );

    changeLabel(
        "avgTemperature",
        "Average Temperature",
        "Daily reading-weighted average"
    );

    changeLabel(
        "totalPower",
        "Combined Average Power",
        "Sum of per-center average kW"
    );

    changeLabel(
        "coolingEfficiency",
        "Cooling Degraded Readings",
        "Daily aggregated count"
    );

    changeLabel(
        "criticalAlerts",
        "Critical Readings",
        "Historical sensor readings"
    );

    // A large reading count isn't a notification count.
    setText("notificationCount", "!");

    const notification = byId("notificationButton");

    if (notification) {
        notification.title =
            "Open historical risk analysis";
    }

    const headerDate = byId("currentDate");

    if (headerDate) {
        headerDate.textContent = formatDate(processDate);
    }

    const headerDescription = document.querySelector(
        ".header-date small"
    );

    if (headerDescription) {
        headerDescription.textContent =
            "Databricks Gold · Daily Summary";
    }

    const footer = document.querySelectorAll(
        ".dashboard-footer span"
    );

    if (footer[1]) {
        footer[1].textContent =
            `Gold Data: ${formatDate(processDate)}`;
    }

    const environmentLabel = document.querySelector(
        ".sidebar-bottom span:last-child"
    );

    if (environmentLabel) {
        environmentLabel.textContent =
            "Databricks Gold";
    }
}

// ============================================================
// 09. OVERVIEW — ISOMETRIC MAP
// ============================================================

function updateOverviewMap() {
    document.querySelectorAll(
        ".map-location-pin"
    ).forEach(pin => {
        const center = getCenter(
            pin.dataset.center
        );

        if (!center) {
            pin.style.display = "none";
            return;
        }

        pin.style.display = "";

        const name = pin.querySelector("strong");

        const temp = pin.querySelector(
            ".pin-temperature"
        );

        const status = pin.querySelector("small");

        if (name) {
            name.textContent = center.id;
        }

        if (temp) {
            temp.textContent =
                center.temperature.toFixed(2) + "°C";

            temp.classList.remove(
                "critical-text",
                "warning-text"
            );
        }

        if (status) {
            status.className = "";

            status.replaceChildren();

            status.appendChild(
                createElement(
                    "i",
                    "status-dot warning"
                )
            );

            status.appendChild(
                document.createTextNode(
                    " Daily Data"
                )
            );
        }

        pin.title =
            `${center.id} — ${center.city}\n` +
            `Average: ${center.temperature.toFixed(2)}°C\n` +
            `Maximum: ${center.maxTemperature.toFixed(2)}°C\n` +
            `Critical Readings: ${formatNumber(center.critical)}`;
    });

    const mapLabel = document.querySelector(
        ".map-demo-label"
    );

    if (mapLabel) {
        mapLabel.textContent =
            "Illustrative map · Actual Gold data";
    }

    const legend = document.querySelector(
        ".data-center-map-card .status-legend"
    );

    if (legend) {
        legend.textContent =
            "Daily aggregated metrics";
    }
}

// ============================================================
// 10. OVERVIEW — DATA CENTER TABLE
// ============================================================

function updateOverviewTable() {
    const table = document.querySelector(
        ".status-table"
    );

    if (!table) return;

    const headings = table.querySelectorAll(
        "thead th"
    );

    const labels = [
        "Data Center",
        "Avg Temperature",
        "Avg Power (kW)",
        "Cooling Degraded",
        "Daily Flags",
        "Process Date"
    ];

    headings.forEach((heading, index) => {
        heading.textContent = labels[index] || "";
    });

    const tbody = byId("dataCenterStatusTable");

    if (!tbody) return;

    tbody.replaceChildren();

    const filtered = dataCenters.filter(center => {
        const search = [
            center.id,
            center.rawId,
            center.city,
            center.region
        ].join(" ").toLowerCase();

        return search.includes(
            currentSearch.toLowerCase()
        );
    });

    filtered.forEach(center => {
        const row = createElement("tr");

        const values = [
            `${center.id} · ${center.city}`,
            center.temperature.toFixed(2) + "°C",
            center.power.toFixed(2),
            formatNumber(center.coolingDegraded),
            "Review",
            formatDate(center.date)
        ];

        values.forEach((value, index) => {
            const cell = createElement(
                "td",
                "",
                value
            );

            if (index === 4) {
                cell.replaceChildren();

                const badge = createElement(
                    "span",
                    "table-status warning",
                    "Review"
                );

                badge.title =
                    "Historical flagged readings, " +
                    "not a live alert.";

                cell.appendChild(badge);
            }

            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });

    if (!filtered.length) {
        const row = createElement("tr");
        const cell = createElement(
            "td",
            "",
            "No matching data centers."
        );

        cell.colSpan = 6;
        cell.style.padding = "20px";
        cell.style.textAlign = "center";

        row.appendChild(cell);
        tbody.appendChild(row);
    }
}

// ============================================================
// 11. OVERVIEW — ALERT SUMMARY
// ============================================================

function updateOverviewAlerts() {
    const summary = dashboardSummary;

    const critical = Number(
        summary.critical_readings || 0
    );

    const warning = Number(
        summary.warning_readings || 0
    );

    const offline = Number(
        summary.offline_sensor_readings || 0
    );

    setText(
        "totalAlertsCount",
        compactNumber(critical + warning + offline)
    );

    setText(
        "criticalAlertCount",
        compactNumber(critical)
    );

    setText(
        "warningAlertCount",
        compactNumber(warning)
    );

    setText(
        "infoAlertCount",
        compactNumber(offline)
    );

    const donutCard = byId("alertDonutChart")
        ?.closest(".dashboard-card");

    const heading = donutCard?.querySelector(
        ".card-heading h2"
    );

    if (heading) {
        heading.textContent =
            "Daily Flagged Readings";
    }

    const centerLabel = donutCard?.querySelector(
        ".donut-center-text span"
    );

    if (centerLabel) {
        centerLabel.textContent = "Reported Flags";
    }

    const legendNames = [
        "Critical",
        "Warning",
        "Offline"
    ];

    donutCard?.querySelectorAll(
        ".donut-legend-row"
    ).forEach((row, index) => {
        const span = row.querySelector("span");

        if (!span) return;

        const circle = span.querySelector("i");

        span.replaceChildren();

        if (circle) span.appendChild(circle);

        span.appendChild(
            document.createTextNode(
                " " + legendNames[index]
            )
        );
    });

    const alertContainer = byId(
        "recentAlertsList"
    );

    if (!alertContainer) return;

    alertContainer.replaceChildren();

    const recentHeading = alertContainer
        .closest(".dashboard-card")
        ?.querySelector(".card-heading h2");

    if (recentHeading) {
        recentHeading.textContent =
            "Daily Risk Summary";
    }

    const sorted = [...dataCenters].sort(
        (a, b) => b.critical - a.critical
    );

    sorted.slice(0, 5).forEach(center => {
        const row = createElement(
            "div",
            "recent-alert-item"
        );

        const icon = createElement(
            "span",
            "recent-alert-icon critical"
        );

        icon.appendChild(
            createElement(
                "i",
                "fa-solid fa-triangle-exclamation"
            )
        );

        row.appendChild(icon);

        row.appendChild(
            createElement(
                "span",
                "recent-alert-center",
                center.id
            )
        );

        row.appendChild(
            createElement(
                "span",
                "recent-alert-message critical",
                `${formatNumber(center.critical)} critical readings`
            )
        );

        row.appendChild(
            createElement(
                "span",
                "recent-alert-time",
                "Daily"
            )
        );

        alertContainer.appendChild(row);
    });
}

// ============================================================
// 12. CHART UTILITIES
// ============================================================

function basicChartScales() {
    const colors = getChartColors();

    return {
        x: {
            grid: {
                display: false
            },

            ticks: {
                color: colors.text,
                font: {
                    size: 9
                }
            }
        },

        y: {
            grid: {
                color: colors.grid
            },

            ticks: {
                color: colors.text,
                font: {
                    size: 9
                }
            },

            beginAtZero: true
        }
    };
}

function destroyCharts(charts) {
    charts.forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });

    charts.length = 0;
}

function updateChartThemes() {
    const colors = getChartColors();

    [
        ...overviewCharts,
        ...detailCharts
    ].forEach(chart => {
        if (!chart) return;

        const scales = chart.options.scales;

        if (scales) {
            ["x", "y"].forEach(axis => {
                if (scales[axis]?.ticks) {
                    scales[axis].ticks.color =
                        colors.text;
                }

                if (scales[axis]?.title) {
                    scales[axis].title.color =
                        colors.text;
                }
            });

            if (scales.y?.grid) {
                scales.y.grid.color = colors.grid;
            }
        }

        chart.update("none");
    });

    if (dataCenters.length) {
        if (currentPage === "overview") {
            createOverviewCharts();
        }

        if (currentPage === "data-centers") {
            createDetailCharts();
        }
    }
}

// ============================================================
// 13. OVERVIEW — TEMPERATURE CHART
// ============================================================

function createTemperatureChart() {
    const canvas = byId("temperatureChart");

    if (!canvas) return null;

    const colors = getChartColors();

    const card = canvas.closest(".dashboard-card");

    const heading = card?.querySelector(
        ".card-heading h2"
    );

    const description = card?.querySelector(
        ".card-heading p"
    );

    if (heading) {
        heading.textContent =
            "Temperature by Data Center";
    }

    if (description) {
        description.textContent =
            "Daily average vs maximum";
    }

    const chart = new Chart(canvas, {
        type: "line",

        data: {
            labels: dataCenters.map(c => c.id),

            datasets: [
                {
                    label: "Daily Average",

                    data: dataCenters.map(
                        c => c.temperature
                    ),

                    borderColor: colors.blue,
                    backgroundColor: colors.blue,

                    borderWidth: 2,
                    tension: .3,
                    pointRadius: 3
                },
                {
                    label: "Daily Maximum",

                    data: dataCenters.map(
                        c => c.maxTemperature
                    ),

                    borderColor: colors.red,
                    backgroundColor: colors.red,

                    borderWidth: 2,
                    tension: .3,
                    pointRadius: 3
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                }
            },

            scales: basicChartScales()
        }
    });

    const legend = byId("temperatureLegend");

    if (legend) {
        legend.replaceChildren();

        [
            ["Daily Average", colors.blue],
            ["Daily Maximum", colors.red]
        ].forEach(([name, color]) => {
            const item = createElement("span");

            const dot = createElement("i");
            dot.style.background = color;

            item.appendChild(dot);

            item.appendChild(
                document.createTextNode(name)
            );

            legend.appendChild(item);
        });
    }

    return chart;
}

// ============================================================
// 14. OVERVIEW — POWER CHART
// ============================================================

function createPowerChart() {
    const canvas = byId("powerChart");

    if (!canvas) return null;

    const colors = getChartColors();

    const card = canvas.closest(".dashboard-card");

    const heading = card?.querySelector(
        ".card-heading h2"
    );

    const subtitle = card?.querySelector(
        ".card-heading p"
    );

    if (heading) {
        heading.textContent =
            "Average Power Consumption";
    }

    if (subtitle) {
        subtitle.textContent =
            "Daily average per center (kW)";
    }

    return new Chart(canvas, {
        type: "bar",

        data: {
            labels: dataCenters.map(c => c.id),

            datasets: [{
                label: "Average Power (kW)",

                data: dataCenters.map(
                    c => c.power
                ),

                backgroundColor: colors.blue,

                hoverBackgroundColor: colors.gold,

                borderRadius: 4,

                maxBarThickness: 30
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                }
            },

            scales: basicChartScales()
        }
    });
}

// ============================================================
// 15. OVERVIEW — DONUT CHART
// ============================================================

function createDonutChart() {
    const canvas = byId("alertDonutChart");

    if (!canvas) return null;

    const colors = getChartColors();

    return new Chart(canvas, {
        type: "doughnut",

        data: {
            labels: [
                "Critical Readings",
                "Warning Readings",
                "Offline Sensor Readings"
            ],

            datasets: [{
                data: [
                    dashboardSummary.critical_readings,
                    dashboardSummary.warning_readings,
                    dashboardSummary.offline_sensor_readings
                ],

                backgroundColor: [
                    colors.red,
                    colors.yellow,
                    colors.blue
                ],

                borderWidth: 0
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            cutout: "70%",

            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// ============================================================
// 16. OVERVIEW — HEATMAP
// ============================================================

function heatmapColor(value) {
    const temperature = Number(value);

    if (temperature < 20) return "#0875fa";
    if (temperature < 25) return "#24cddd";
    if (temperature < 30) return "#63d9a3";
    if (temperature < 35) return "#ffe268";
    if (temperature < 40) return "#ff993f";

    return "#ff4c4e";
}

function updateOverviewHeatmap() {
    const grid = byId("temperatureHeatmap");
    const yLabels = byId("heatmapYLabels");
    const xLabels = byId("heatmapXLabels");

    if (!grid || !yLabels || !xLabels) {
        return;
    }

    grid.replaceChildren();
    yLabels.replaceChildren();
    xLabels.replaceChildren();

    grid.style.gridTemplateColumns =
        "repeat(2, minmax(0, 1fr))";

    grid.style.gridTemplateRows =
        `repeat(${dataCenters.length}, minmax(0, 1fr))`;

    dataCenters.forEach(center => {
        yLabels.appendChild(
            createElement(
                "span",
                "",
                center.id
            )
        );

        [
            ["Daily Average", center.temperature],
            ["Daily Maximum", center.maxTemperature]
        ].forEach(([name, value]) => {
            const cell = createElement(
                "div",
                "heatmap-cell"
            );

            cell.style.background =
                heatmapColor(value);

            cell.title =
                `${center.id} · ${center.city}\n` +
                `${name}: ${value.toFixed(2)}°C`;

            grid.appendChild(cell);
        });
    });

    ["Daily Average", "Daily Maximum"].forEach(
        label => {
            xLabels.appendChild(
                createElement("span", "", label)
            );
        }
    );

    const title = grid
        .closest(".dashboard-card")
        ?.querySelector(".card-heading h2");

    if (title) {
        title.textContent =
            "Daily Temperature Heatmap";
    }

    const period = byId("heatmapPeriod");

    if (period) {
        period.replaceChildren();

        const option = document.createElement("option");

        option.value = processDate;
        option.textContent = formatDate(processDate);

        period.appendChild(option);
    }
}

// ============================================================
// 17. OVERVIEW — CORRELATION CHART
// ============================================================

function createCorrelationChart() {
    const canvas = byId("correlationChart");

    if (!canvas) return null;

    const colors = getChartColors();

    return new Chart(canvas, {
        type: "scatter",

        data: {
            datasets: [{
                label: "Data Centers",

                data: dataCenters.map(center => ({
                    x: center.temperature,
                    y: center.power,
                    centerId: center.id,
                    city: center.city
                })),

                backgroundColor: colors.blue,

                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    callbacks: {
                        title(items) {
                            const point = items[0]?.raw;

                            return point
                                ? `${point.centerId} — ${point.city}`
                                : "";
                        }
                    }
                }
            },

            scales: {
                x: {
                    ...basicChartScales().x,

                    type: "linear",

                    title: {
                        display: true,
                        text: "Avg Temperature (°C)",
                        color: colors.text
                    }
                },

                y: {
                    ...basicChartScales().y,

                    title: {
                        display: true,
                        text: "Avg Power (kW)",
                        color: colors.text
                    }
                }
            }
        }
    });
}

// ============================================================
// 18. CREATE OVERVIEW CHARTS
// ============================================================

function createOverviewCharts() {
    if (
        !dataCenters.length ||
        typeof Chart === "undefined"
    ) {
        return;
    }

    destroyCharts(overviewCharts);

    [
        createTemperatureChart(),
        createPowerChart(),
        createDonutChart(),
        createCorrelationChart()
    ].forEach(chart => {
        if (chart) overviewCharts.push(chart);
    });

    applyOverviewChartFilters();
}

function applyOverviewChartFilters() {
    const temperatureFilter = byId(
        "temperatureCenterFilter"
    )?.value || "all";

    const powerFilter = byId(
        "powerCenterFilter"
    )?.value || "all";

    const filteredTemperature =
        temperatureFilter === "all"
            ? dataCenters
            : dataCenters.filter(
                c => c.id === temperatureFilter
            );

    const filteredPower =
        powerFilter === "all"
            ? dataCenters
            : dataCenters.filter(
                c => c.id === powerFilter
            );

    const tempChart = overviewCharts.find(
        chart =>
            chart.canvas.id === "temperatureChart"
    );

    const powerChart = overviewCharts.find(
        chart =>
            chart.canvas.id === "powerChart"
    );

    if (tempChart) {
        tempChart.data.labels = filteredTemperature.map(
            c => c.id
        );

        tempChart.data.datasets[0].data =
            filteredTemperature.map(
                c => c.temperature
            );

        tempChart.data.datasets[1].data =
            filteredTemperature.map(
                c => c.maxTemperature
            );

        tempChart.update();
    }

    if (powerChart) {
        powerChart.data.labels = filteredPower.map(
            c => c.id
        );

        powerChart.data.datasets[0].data =
            filteredPower.map(c => c.power);

        powerChart.update();
    }
}

// ============================================================
// 19. RENDER OVERVIEW
// ============================================================

function renderOverview() {
    updateOverviewKPIs();

    updateOverviewMap();

    updateOverviewTable();

    updateOverviewAlerts();

    updateOverviewHeatmap();

    if (currentPage === "overview") {
        requestAnimationFrame(() => {
            createOverviewCharts();
        });
    }
}

// ============================================================
// 20. PREMIUM DATA CENTERS PAGE
// ============================================================

function buildDataCentersPage() {
    const root = createElement(
        "div",
        "premium-page"
    );

    root.innerHTML = `
        <div class="premium-toolbar">
            <p>
                Explore actual data center performance,
                sensor health and daily infrastructure analytics
                from Databricks Gold.
            </p>

            <button
                class="premium-refresh"
                id="dcxRefresh"
            >
                <i class="fa-solid fa-rotate"></i>
                Refresh Data
            </button>
        </div>

        <div class="premium-summary-grid">
            <div class="premium-summary-card">
                <span>Monitored Data Centers</span>
                <strong id="dcxTotalCenters">—</strong>
                <small>Across Indian locations</small>
            </div>

            <div class="premium-summary-card">
                <span>Total Daily Sensor Readings</span>
                <strong id="dcxTotalReadings">—</strong>
                <small>Latest Gold summary</small>
            </div>

            <div class="premium-summary-card">
                <span>Gold Process Date</span>
                <strong id="dcxDate">—</strong>
                <small>Last processed day</small>
            </div>
        </div>

        <h3 class="premium-section-title">
            Select a Data Center
        </h3>

        <div
            class="dcx-center-grid"
            id="dcxCenterCards"
        ></div>

        <div
            class="dcx-detail-panel"
            id="dcxDetailPanel"
        ></div>

        <h3 class="premium-section-title">
            Infrastructure Performance Comparison
        </h3>

        <p class="premium-muted">
            Compare actual daily temperature, humidity and
            average power measurements across all 10 centers.
            The selected center is highlighted in gold.
        </p>

        <div class="dcx-comparison-grid">
            <article class="dcx-chart-card">
                <h4>
                    <i class="fa-solid fa-temperature-half"></i>
                    Average Temperature
                </h4>
                <p>Daily average · °C</p>

                <div class="dcx-chart-wrap">
                    <canvas id="dcxTempChart"></canvas>
                </div>
            </article>

            <article class="dcx-chart-card">
                <h4>
                    <i class="fa-solid fa-droplet"></i>
                    Average Humidity
                </h4>
                <p>Daily average · %</p>

                <div class="dcx-chart-wrap">
                    <canvas id="dcxHumidityChart"></canvas>
                </div>
            </article>

            <article class="dcx-chart-card">
                <h4>
                    <i class="fa-solid fa-bolt"></i>
                    Average Power
                </h4>
                <p>Daily average · kW</p>

                <div class="dcx-chart-wrap">
                    <canvas id="dcxPowerChart"></canvas>
                </div>
            </article>
        </div>

        <div class="premium-page-note">
            <i class="fa-solid fa-circle-info"></i>
            These are daily historical measurements.
            Critical readings, cooling failures and
            offline sensor readings are aggregate counts,
            not unique live incidents.
        </div>
    `;

    root.querySelector("#dcxRefresh")
        .addEventListener("click", async () => {
            await loadDashboardData(true);
        });

    root.querySelector("#dcxCenterCards")
        .addEventListener("click", event => {
            const button = event.target.closest(
                "[data-center-id]"
            );

            if (!button) return;

            selectedCenterId =
                button.dataset.centerId;

            renderDataCenterCards();
            renderSelectedCenter();
            updateSelectedChartColors();
        });

    return root;
}

// ============================================================
// 21. DATA CENTERS — SUMMARY
// ============================================================

function renderDataCenterSummary() {
    setText(
        "dcxTotalCenters",
        dataCenters.length
    );

    setText(
        "dcxTotalReadings",
        formatNumber(
            dashboardSummary.total_readings
        )
    );

    setText(
        "dcxDate",
        formatDate(processDate)
    );
}

// ============================================================
// 22. DATA CENTERS — SELECTABLE CARDS
// ============================================================

function renderDataCenterCards() {
    const container = byId("dcxCenterCards");

    if (!container) return;

    container.replaceChildren();

    dataCenters.forEach(center => {
        const selected =
            selectedCenterId === center.id;

        const button = createElement(
            "button",
            "dcx-center-card"
        );

        button.type = "button";
        button.dataset.centerId = center.id;

        button.setAttribute(
            "aria-pressed",
            String(selected)
        );

        if (selected) {
            button.classList.add("selected");
        }

        const header = createElement(
            "div",
            "dcx-center-card-header"
        );

        header.appendChild(
            createElement(
                "strong",
                "",
                center.id
            )
        );

        const iconBox = createElement(
            "span",
            "dcx-center-icon"
        );

        iconBox.appendChild(
            createElement(
                "i",
                "fa-solid fa-server"
            )
        );

        header.appendChild(iconBox);

        button.appendChild(header);

        button.appendChild(
            createElement(
                "span",
                "dcx-center-city",
                center.city
            )
        );

        button.appendChild(
            createElement(
                "span",
                "dcx-center-temperature",
                center.temperature.toFixed(2) + "°C"
            )
        );

        button.appendChild(
            createElement(
                "span",
                "dcx-center-caption",
                "Average daily temperature"
            )
        );

        button.appendChild(
            createElement(
                "span",
                "dcx-center-region",
                center.region + " REGION"
            )
        );

        container.appendChild(button);
    });
}

// ============================================================
// 23. DATA CENTERS — RISK RANK
// ============================================================

function calculateCenterRank(center) {
    const sorted = [...dataCenters].sort(
        (a, b) =>
            percentage(b.critical, b.readings) -
            percentage(a.critical, a.readings)
    );

    return sorted.findIndex(
        item => item.id === center.id
    ) + 1;
}

// ============================================================
// 24. DATA CENTERS — SELECTED DETAILS
// ============================================================

function renderSelectedCenter() {
    const container = byId("dcxDetailPanel");

    if (!container) return;

    container.replaceChildren();

    const center = getCenter(selectedCenterId);

    if (!center) return;

    const heading = createElement(
        "div",
        "dcx-detail-header"
    );

    const headingLeft = createElement("div");

    headingLeft.appendChild(
        createElement(
            "h3",
            "",
            `${center.id} — ${center.city}`
        )
    );

    headingLeft.appendChild(
        createElement(
            "p",
            "",
            `${center.region} Region · ${formatDate(center.date)}`
        )
    );

    heading.appendChild(headingLeft);

    heading.appendChild(
        createElement(
            "span",
            "dcx-rank-label",
            `Critical Rate Rank #${calculateCenterRank(center)} of ${dataCenters.length}`
        )
    );

    container.appendChild(heading);

    const grid = createElement(
        "div",
        "dcx-detail-grid"
    );

    const metrics = [
        [
            "Daily Sensor Readings",
            formatNumber(center.readings),
            ""
        ],
        [
            "Average Temperature",
            center.temperature.toFixed(2) + "°C",
            "blue-value"
        ],
        [
            "Maximum Temperature",
            center.maxTemperature.toFixed(2) + "°C",
            ""
        ],
        [
            "Average Humidity",
            center.humidity.toFixed(2) + "%",
            ""
        ],
        [
            "Average Power",
            center.power.toFixed(2) + " kW",
            "blue-value"
        ],
        [
            "Critical Readings",
            formatNumber(center.critical),
            "red-value"
        ],
        [
            "Warning Readings",
            formatNumber(center.warning),
            "gold-value"
        ],
        [
            "Cooling Failures",
            formatNumber(center.coolingFailures),
            "red-value"
        ],
        [
            "Cooling Degraded",
            formatNumber(center.coolingDegraded),
            "gold-value"
        ],
        [
            "Offline Sensor Readings",
            formatNumber(center.offlineSensors),
            ""
        ],
        [
            "Critical Reading Rate",
            percentage(
                center.critical,
                center.readings
            ).toFixed(2) + "%",
            "red-value"
        ],
        [
            "Warning Reading Rate",
            percentage(
                center.warning,
                center.readings
            ).toFixed(2) + "%",
            "gold-value"
        ],
        [
            "Offline Reading Rate",
            percentage(
                center.offlineSensors,
                center.readings
            ).toFixed(2) + "%",
            ""
        ]
    ];

    metrics.forEach(([label, value, color]) => {
        const card = createElement(
            "div",
            "dcx-detail-item"
        );

        card.appendChild(
            createElement("span", "", label)
        );

        card.appendChild(
            createElement(
                "strong",
                color,
                value
            )
        );

        grid.appendChild(card);
    });

    container.appendChild(grid);
}

// ============================================================
// 25. DATA CENTERS — COMPARISON CHARTS
// ============================================================

function createDetailChart(canvasId, field, color) {
    const canvas = byId(canvasId);

    if (!canvas || typeof Chart === "undefined") {
        return null;
    }

    return new Chart(canvas, {
        type: "bar",

        data: {
            labels: dataCenters.map(
                center => center.id
            ),

            datasets: [{
                label: field,

                data: dataCenters.map(
                    center => center[field]
                ),

                backgroundColor: dataCenters.map(
                    center =>
                        center.id === selectedCenterId
                            ? "#f4b544"
                            : color
                ),

                borderRadius: 5,
                maxBarThickness: 26
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    callbacks: {
                        title(items) {
                            const index =
                                items[0]?.dataIndex;

                            const center =
                                dataCenters[index];

                            return center
                                ? `${center.id} — ${center.city}`
                                : "";
                        }
                    }
                }
            },

            scales: basicChartScales()
        }
    });
}

function createDetailCharts() {
    if (
        currentPage !== "data-centers" ||
        typeof Chart === "undefined"
    ) {
        return;
    }

    destroyCharts(detailCharts);

    const colors = getChartColors();

    [
        createDetailChart(
            "dcxTempChart",
            "temperature",
            colors.blue
        ),
        createDetailChart(
            "dcxHumidityChart",
            "humidity",
            colors.cyan
        ),
        createDetailChart(
            "dcxPowerChart",
            "power",
            colors.purple
        )
    ].forEach(chart => {
        if (chart) {
            detailCharts.push(chart);
        }
    });
}

function updateSelectedChartColors() {
    const colors = getChartColors();

    const normalColors = [
        colors.blue,
        colors.cyan,
        colors.purple
    ];

    detailCharts.forEach((chart, index) => {
        chart.data.datasets[0].backgroundColor =
            dataCenters.map(center =>
                center.id === selectedCenterId
                    ? colors.gold
                    : normalColors[index]
            );

        chart.update();
    });
}

// ============================================================
// 26. RENDER PREMIUM DATA CENTERS PAGE
// ============================================================

function renderDataCentersPage() {
    const container = document.querySelector(
        "#secondaryPage .secondary-page-content"
    );

    if (!container) return;

    if (
        !selectedCenterId ||
        !getCenter(selectedCenterId)
    ) {
        selectedCenterId =
            dataCenters[0]?.id || null;
    }

    container.classList.add(
        "premium-page-active"
    );

    container.replaceChildren(
        buildDataCentersPage()
    );

    renderDataCenterSummary();

    renderDataCenterCards();

    renderSelectedCenter();

    requestAnimationFrame(() => {
        createDetailCharts();
    });
}

// ============================================================
// 27. RISK INTELLIGENCE — FETCH
// ============================================================

async function fetchRiskData(force = false) {
    if (riskData && !force) {
        return riskData;
    }

    if (riskLoading) {
        return riskData;
    }

    riskLoading = true;

    try {
        const response = await fetch(API.risk, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                `Risk API HTTP ${response.status}`
            );
        }

        const result = await response.json();

        if (!Array.isArray(result.data_centers)) {
            throw new Error(
                "Invalid risk API response."
            );
        }

        riskData = result;

        return result;

    } finally {
        riskLoading = false;
    }
}

// ============================================================
// 28. RISK INTELLIGENCE — PAGE
// ============================================================

function buildRiskPage() {
    const root = createElement(
        "div",
        "premium-page"
    );

    root.innerHTML = `
        <div class="premium-toolbar">
            <p>
                Historical daily risk rankings calculated
                using actual Databricks Gold sensor readings.
            </p>

            <button
                class="premium-refresh"
                id="riskxRefresh"
            >
                <i class="fa-solid fa-rotate"></i>
                Refresh Risk Data
            </button>
        </div>

        <div class="premium-summary-grid">
            <div class="premium-summary-card">
                <span>Highest Critical Rate</span>
                <strong id="riskxHighest">—</strong>
                <small>Highest relative daily rate</small>
            </div>

            <div class="premium-summary-card">
                <span>Lowest Critical Rate</span>
                <strong id="riskxLowest">—</strong>
                <small>Lowest relative daily rate</small>
            </div>

            <div class="premium-summary-card">
                <span>Analyzed Data Centers</span>
                <strong id="riskxTotal">—</strong>
                <small>Latest processed day</small>
            </div>
        </div>

        <h3 class="premium-section-title">
            Data Center Risk Ranking
        </h3>

        <div class="riskx-table-wrapper">
            <table class="riskx-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Data Center</th>
                        <th>Critical Rate</th>
                        <th>Warning Rate</th>
                        <th>Cooling Failure Rate</th>
                        <th>Offline Rate</th>
                    </tr>
                </thead>

                <tbody id="riskxTableBody">
                </tbody>
            </table>
        </div>

        <div class="premium-page-note">
            Risk rank is based on the daily critical-reading
            percentage, not live equipment health.
            The bars compare centers relative to the
            highest observed rate, not against a safety threshold.
            Metrics may overlap.
        </div>
    `;

    root.querySelector("#riskxRefresh")
        .addEventListener("click", () => {
            loadRiskPage(true);
        });

    return root;
}

// ============================================================
// 29. RISK INTELLIGENCE — RENDER
// ============================================================

function renderRiskResults(result) {
    if (currentPage !== "alerts") return;

    const centers = result.data_centers || [];

    if (!centers.length) {
        setText("riskxTotal", 0);
        return;
    }

    const rates = centers.map(
        center => Number(
            center.critical_rate_pct || 0
        )
    );

    const highest = Math.max(...rates);
    const lowest = Math.min(...rates);

    setText(
        "riskxHighest",
        highest.toFixed(2) + "%"
    );

    setText(
        "riskxLowest",
        lowest.toFixed(2) + "%"
    );

    setText(
        "riskxTotal",
        centers.length
    );

    const tbody = byId("riskxTableBody");

    if (!tbody) return;

    tbody.replaceChildren();

    centers.forEach(center => {
        const row = createElement("tr");

        const rankCell = createElement(
            "td",
            "riskx-rank",
            "#" + center.risk_rank
        );

        row.appendChild(rankCell);

        const nameCell = createElement(
            "td",
            "riskx-name"
        );

        nameCell.appendChild(
            createElement(
                "span",
                "",
                normalizeCenterId(
                    center.data_center_id
                )
            )
        );

        nameCell.appendChild(
            createElement(
                "span",
                "riskx-city",
                center.city
            )
        );

        row.appendChild(nameCell);

        const criticalCell = createElement("td");

        criticalCell.appendChild(
            createElement(
                "span",
                "",
                Number(
                    center.critical_rate_pct
                ).toFixed(2) + "%"
            )
        );

        const track = createElement(
            "div",
            "riskx-bar-track"
        );

        const fill = createElement(
            "div",
            "riskx-bar-fill"
        );

        fill.style.width =
            (
                highest > 0
                    ? center.critical_rate_pct
                      / highest * 100
                    : 0
            ) + "%";

        track.appendChild(fill);

        criticalCell.appendChild(track);

        row.appendChild(criticalCell);

        [
            center.warning_rate_pct,
            center.cooling_failure_rate_pct,
            center.offline_sensor_rate_pct
        ].forEach(value => {
            row.appendChild(
                createElement(
                    "td",
                    "",
                    Number(value || 0).toFixed(2) + "%"
                )
            );
        });

        tbody.appendChild(row);
    });
}

// ============================================================
// 30. RISK INTELLIGENCE — LOAD PAGE
// ============================================================

async function loadRiskPage(force = false) {
    const button = byId("riskxRefresh");

    if (button) {
        button.disabled = true;
        button.textContent = "Loading...";
    }

    try {
        const result = await fetchRiskData(force);

        if (result) {
            renderRiskResults(result);
        }

    } catch (error) {
        console.error(
            "Risk analysis failed:",
            error
        );

        if (currentPage === "alerts") {
            const tbody = byId("riskxTableBody");

            if (tbody) {
                tbody.replaceChildren();

                const row = createElement("tr");

                const cell = createElement(
                    "td",
                    "premium-error",
                    "Unable to fetch risk data. Check FastAPI."
                );

                cell.colSpan = 6;
                row.appendChild(cell);
                tbody.appendChild(row);
            }
        }

    } finally {
        const refreshButton = byId(
            "riskxRefresh"
        );

        if (refreshButton) {
            refreshButton.disabled = false;

            refreshButton.innerHTML =
                '<i class="fa-solid fa-rotate"></i> Refresh Risk Data';
        }
    }
}

function renderRiskPage() {
    const container = document.querySelector(
        "#secondaryPage .secondary-page-content"
    );

    if (!container) return;

    container.classList.add(
        "premium-page-active"
    );

    container.replaceChildren(
        buildRiskPage()
    );

    loadRiskPage();
}

// ============================================================
// 31. NAVIGATION
// ============================================================

const pageDetails = {
    overview: {
        title: "Overview",
        description: "Infrastructure monitoring"
    },

    intelligence: {
        title: "Intelligence",
        description: "Day-over-Day Intelligence & Investigation Insights"
    },
    
    anomalies: {
        title: "Anomaly Detection",
        description: "Rule-Based Data Center Anomaly Monitoring"
   },  


    "data-centers": {
        title: "Data Centers",
        description: "Detailed data center intelligence"
    },

    temperature: {
        title: "Temperature",
        description: "Thermal monitoring and analytics"
    },

    power: {
        title: "Power & Energy",
        description: "Power consumption analytics"
    },

    cooling: {
        title: "Cooling Systems",
        description: "Cooling performance and failures"
    },

    alerts: {
        title: "Alerts & Risk Intelligence",
        description: "Historical daily risk analysis"
    },

    reports: {
        title: "Reports",
        description: "Databricks Gold reports"
    }
};

function closeMobileMenu() {
    byId("sidebar")?.classList.remove("open");

    byId("sidebarOverlay")?.classList.remove("open");
}

function renderPlaceholderPage(page) {
    const container = document.querySelector(
        "#secondaryPage .secondary-page-content"
    );

    if (!container) return;

    container.classList.remove(
        "premium-page-active"
    );

    container.replaceChildren();

    const icon = createElement(
        "div",
        "secondary-placeholder-icon"
    );

    icon.appendChild(
        createElement(
            "i",
            "fa-solid fa-chart-line"
        )
    );

    container.appendChild(icon);

    container.appendChild(
        createElement(
            "h3",
            "",
            pageDetails[page].title
        )
    );

    container.appendChild(
        createElement(
            "p",
            "",
            "This analytics module will be implemented " +
            "using actual Databricks Gold data."
        )
    );

    const back = createElement(
        "button",
        "back-button",
        "← Back to Overview"
    );

    back.addEventListener("click", () => {
        navigateToPage("overview");
    });

    container.appendChild(back);
}

function navigateToPage(page) {
    if (!pageDetails[page]) return;

    const previousPage = currentPage;

    currentPage = page;

    const isOverview = page === "overview";

    byId("overview")?.classList.toggle(
        "hidden",
        !isOverview
    );

    byId("secondaryPage")?.classList.toggle(
        "hidden",
        isOverview
    );

    document.querySelectorAll(
        ".nav-item"
    ).forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.page === page
        );
    });

    if (previousPage === "data-centers") {
        destroyCharts(detailCharts);
    }

    if (page === "overview") {
        requestAnimationFrame(() => {
            overviewCharts.forEach(
                chart => chart.resize()
            );
        });

    } else {
        setText(
            "secondaryPageTitle",
            pageDetails[page].title
        );

        setText(
            "secondaryPageDescription",
            pageDetails[page].description
        );

        if (page === "data-centers") {
            if (dataCenters.length) {
                renderDataCentersPage();
            } else {
                renderPlaceholderPage(page);
            }

        } else if (page === "alerts") {
            renderRiskPage();

        } else {
            renderPlaceholderPage(page);
        }
    }

    closeMobileMenu();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// ============================================================
// 32. MOBILE MENU
// ============================================================

function initializeNavigation() {
    document.querySelectorAll(
        ".nav-item"
    ).forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();

            navigateToPage(
                link.dataset.page
            );
        });
    });

    byId("notificationButton")?.addEventListener(
        "click",
        () => navigateToPage("alerts")
    );

    byId("viewAllAlerts")?.addEventListener(
        "click",
        () => navigateToPage("alerts")
    );

    byId("backToOverview")?.addEventListener(
        "click",
        () => navigateToPage("overview")
    );

    byId("mobileMenuButton")?.addEventListener(
        "click",
        () => {
            byId("sidebar")?.classList.toggle("open");

            byId("sidebarOverlay")?.classList.toggle(
                "open"
            );
        }
    );

    byId("sidebarOverlay")?.addEventListener(
        "click",
        closeMobileMenu
    );
}

// ============================================================
// 33. SEARCH AND FILTERS
// ============================================================

function initializeSearchAndFilters() {
    byId("globalSearch")?.addEventListener(
        "input",
        event => {
            currentSearch =
                event.target.value.trim();

            updateOverviewTable();

            document.querySelectorAll(
                ".map-location-pin"
            ).forEach(pin => {
                const center = getCenter(
                    pin.dataset.center
                );

                if (!center) return;

                const searchable = [
                    center.id,
                    center.city,
                    center.region
                ].join(" ").toLowerCase();

                pin.style.opacity =
                    searchable.includes(
                        currentSearch.toLowerCase()
                    )
                        ? "1"
                        : ".25";
            });
        }
    );

    byId("temperatureCenterFilter")?.addEventListener(
        "change",
        applyOverviewChartFilters
    );

    byId("powerCenterFilter")?.addEventListener(
        "change",
        applyOverviewChartFilters
    );
}

// ============================================================
// 34. FETCH ACTUAL DATABRICKS GOLD DATA
// ============================================================

async function loadDashboardData(showMessage = false) {
    if (dashboardLoading) return;

    dashboardLoading = true;

    try {
        const response = await fetch(
            API.overview,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(
                `Overview API HTTP ${response.status}`
            );
        }

        const result = await response.json();

        if (
            result.source !== "databricks_gold" ||
            !Array.isArray(result.data_centers)
        ) {
            throw new Error(
                "Invalid API response."
            );
        }

        if (!result.data_centers.length) {
            throw new Error(
                "No Gold records available."
            );
        }

        dashboardSummary =
            result.summary || {};

        processDate = result.process_date;

        dataCenters = result.data_centers.map(
            normalizeApiCenter
        );

        renderOverview();

        if (currentPage === "data-centers") {
            renderDataCentersPage();
        }

        if (showMessage) {
            showToast(
                "Latest Databricks Gold data loaded successfully."
            );
        }

        console.log(
            "Databricks Gold loaded:",
            dataCenters.length,
            "centers"
        );

    } catch (error) {
        console.error(
            "Databricks API error:",
            error
        );

        showToast(
            "Unable to load Databricks data. Check FastAPI."
        );

        if (!dataCenters.length) {
            setText(
                "currentDate",
                "API Unavailable"
            );

            const status = document.querySelector(
                ".header-date small"
            );

            if (status) {
                status.textContent =
                    "Check backend on port 8000";
            }
        }

    } finally {
        dashboardLoading = false;
    }
}

// ============================================================
// 35. INITIALIZE APPLICATION
// ============================================================

function initializeDashboard() {
    injectPremiumStyles();

    initializeTheme();

    initializeNavigation();

    initializeSearchAndFilters();

    byId("profileButton")?.addEventListener(
        "click",
        () => {
            showToast(
                "Administrator authentication is not configured yet."
            );
        }
    );

    loadDashboardData();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeDashboard
    );
} else {
    initializeDashboard();
}


/* ==========================================================
   TEMPERATURE ANALYTICS PAGE
   Uses actual Databricks Gold daily data.

   ADD THIS AT THE END OF script.js
   Do not remove existing code.
========================================================== */

(() => {
    "use strict";

    const container = document.querySelector(
        "#secondaryPage .secondary-page-content"
    );

    if (!container) return;

    let selectedId = null;
    let charts = [];

    // ------------------------------------------------------
    // 1. STYLING
    // ------------------------------------------------------

    const style = document.createElement("style");

    style.textContent = `
        .secondary-page-content.temp-page-active {
            display: block;
            text-align: left;
            padding: 22px;
            min-height: 400px;
        }

        .temp-workspace {
            width: 100%;
            color: var(--text-primary);
        }

        .temp-intro {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 19px;
        }

        .temp-intro p,
        .temp-note {
            color: var(--text-secondary);
            font-size: 11px;
            line-height: 1.8;
        }

        .temp-refresh {
            padding: 11px 16px;
            background: linear-gradient(135deg, #0872f9, #438eff);
            color: white;
            border-radius: 9px;
            font-weight: 800;
            font-size: 11px;
        }

        .temp-kpi-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 13px;
            margin-bottom: 22px;
        }

        .temp-kpi {
            padding: 20px;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-left: 4px solid #2682ff;
            border-radius: 12px;
            background-image: linear-gradient(
                120deg,
                rgba(38,130,255,.07),
                transparent
            );
        }

        .temp-kpi:nth-child(2) {
            border-left-color: #ef6269;
            background-image: linear-gradient(
                120deg,
                rgba(239,98,105,.08),
                transparent
            );
        }

        .temp-kpi:nth-child(3) {
            border-left-color: #e9ac39;
            background-image: linear-gradient(
                120deg,
                rgba(233,172,57,.09),
                transparent
            );
        }

        .temp-kpi span {
            color: var(--text-secondary);
            font-size: 11px;
        }

        .temp-kpi strong {
            display: block;
            margin-top: 10px;
            font-size: 25px;
            font-weight: 800;
        }

        .temp-kpi small {
            display: block;
            color: var(--text-muted);
            font-size: 10px;
            margin-top: 7px;
        }

        .temp-section-heading {
            font-size: 16px;
            font-weight: 800;
            margin: 24px 0 14px;
        }

        .temp-centers-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 11px;
        }

        .temp-center-card {
            min-width: 0;
            text-align: left;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 15px;
            background: var(--card-bg);
            color: var(--text-primary);
            transition: transform .2s, border-color .2s;
        }

        .temp-center-card:hover {
            transform: translateY(-3px);
            border-color: var(--primary-blue);
        }

        .temp-center-card.selected {
            border: 2px solid var(--primary-blue);
            background: var(--blue-glow);
        }

        .temp-center-card:focus-visible {
            outline: 2px solid var(--primary-blue);
            outline-offset: 2px;
        }

        .temp-center-card strong {
            display: block;
            font-size: 12px;
        }

        .temp-center-card small {
            display: block;
            color: var(--text-secondary);
            font-size: 10px;
            margin-top: 8px;
        }

        .temp-center-card .temp-card-value {
            display: block;
            font-size: 19px;
            font-weight: 800;
            color: var(--primary-blue);
            margin-top: 12px;
        }

        .temp-detail {
            margin-top: 20px;
            padding: 20px;
            border: 1px solid var(--border-color);
            border-radius: 13px;
            background: var(--card-bg);
        }

        .temp-detail-title {
            font-size: 17px;
            font-weight: 800;
        }

        .temp-detail-subtitle {
            color: var(--text-secondary);
            font-size: 11px;
            margin-top: 7px;
        }

        .temp-detail-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
            margin-top: 19px;
        }

        .temp-detail-metric {
            background: var(--card-subtle);
            border: 1px solid var(--border-color);
            padding: 15px;
            border-radius: 10px;
        }

        .temp-detail-metric span {
            display: block;
            color: var(--text-secondary);
            font-size: 10px;
        }

        .temp-detail-metric strong {
            display: block;
            color: var(--text-primary);
            font-size: 17px;
            margin-top: 9px;
        }

        .temp-detail-metric:nth-child(2) strong {
            color: var(--red);
        }

        .temp-chart-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 13px;
        }

        .temp-chart-card {
            min-width: 0;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 18px;
        }

        .temp-chart-card:first-child {
            border-top: 3px solid #2786ff;
        }

        .temp-chart-card:last-child {
            border-top: 3px solid #e9ac39;
        }

        .temp-chart-card h4 {
            font-size: 12px;
            font-weight: 800;
        }

        .temp-chart-card p {
            margin-top: 6px;
            color: var(--text-secondary);
            font-size: 10px;
        }

        .temp-chart-wrap {
            position: relative;
            height: 240px;
            margin-top: 16px;
        }

        .temp-chart-wrap canvas {
            display: block;
            max-width: 100%;
        }

        .temp-note {
            margin-top: 20px;
            background: var(--card-subtle);
            border-left: 3px solid var(--primary-blue);
            padding: 14px;
            border-radius: 8px;
        }

        @media (max-width: 1050px) {
            .temp-centers-grid {
                grid-template-columns: repeat(3, minmax(0, 1fr));
            }
        }

        @media (max-width: 700px) {
            .temp-kpi-grid,
            .temp-chart-grid {
                grid-template-columns: 1fr;
            }

            .temp-centers-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .temp-detail-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .secondary-page-content.temp-page-active {
                padding: 13px;
            }
        }

        @media (max-width: 400px) {
            .temp-centers-grid,
            .temp-detail-grid {
                grid-template-columns: 1fr;
            }
        }
    `;

    document.head.appendChild(style);

    // ------------------------------------------------------
    // 2. DESTROY TEMPERATURE CHARTS
    // ------------------------------------------------------

    function destroyTemperatureCharts() {
        charts.forEach(chart => chart.destroy());
        charts = [];
    }

    // ------------------------------------------------------
    // 3. BUILD TEMPERATURE PAGE
    // ------------------------------------------------------

    function showTemperaturePage() {
        destroyTemperatureCharts();

        if (!dataCenters.length) {
            container.textContent =
                "Databricks data is loading. Please try again shortly.";
            return;
        }

        container.classList.add("temp-page-active");

        container.innerHTML = `
            <div class="temp-workspace">

                <div class="temp-intro">
                    <p>
                        Explore actual daily thermal measurements
                        across all monitored data centers.
                    </p>

                    <button class="temp-refresh"
                            id="tempRefresh">
                        Refresh Temperature Data
                    </button>
                </div>

                <div class="temp-kpi-grid">
                    <div class="temp-kpi">
                        <span>Overall Average Temperature</span>
                        <strong id="tempOverallAvg">—</strong>
                        <small>Reading-weighted daily average</small>
                    </div>

                    <div class="temp-kpi">
                        <span>Highest Recorded Temperature</span>
                        <strong id="tempOverallMax">—</strong>
                        <small>Maximum in latest daily Gold data</small>
                    </div>

                    <div class="temp-kpi">
                        <span>Monitored Data Centers</span>
                        <strong id="tempCenterCount">—</strong>
                        <small id="tempProcessDate">Daily snapshot</small>
                    </div>
                </div>

                <h3 class="temp-section-heading">
                    Select a Data Center
                </h3>

                <div class="temp-centers-grid"
                     id="tempCenterCards"></div>

                <div class="temp-detail"
                     id="tempSelectedDetails"></div>

                <h3 class="temp-section-heading">
                    Thermal Performance Comparison
                </h3>

                <div class="temp-chart-grid">
                    <div class="temp-chart-card">
                        <h4>Average vs Maximum Temperature</h4>
                        <p>Actual daily readings · °C</p>

                        <div class="temp-chart-wrap">
                            <canvas id="tempComparisonChart"></canvas>
                        </div>
                    </div>

                    <div class="temp-chart-card">
                        <h4>Daily Temperature Gap</h4>
                        <p>Maximum minus average temperature · °C</p>

                        <div class="temp-chart-wrap">
                            <canvas id="tempGapChart"></canvas>
                        </div>
                    </div>
                </div>

                <div class="temp-note">
                    All measurements come from the latest
                    Databricks Gold daily summary. The temperature
                    gap is a derived metric, not a live alarm.
                    Actual hourly trends require hourly sensor
                    aggregates, which are not connected yet.
                </div>

            </div>
        `;

        document.getElementById("tempOverallAvg")
            .textContent =
                Number(
                    dashboardSummary.average_temperature || 0
                ).toFixed(2) + "°C";

        document.getElementById("tempOverallMax")
            .textContent =
                Math.max(
                    ...dataCenters.map(c => c.maxTemperature)
                ).toFixed(2) + "°C";

        document.getElementById("tempCenterCount")
            .textContent = dataCenters.length;

        document.getElementById("tempProcessDate")
            .textContent = "Gold date: " + processDate;

        if (
            !selectedId ||
            !dataCenters.some(c => c.id === selectedId)
        ) {
            selectedId = dataCenters[0].id;
        }

        renderCenterCards();
        renderSelectedDetails();
        createCharts();

        document.getElementById("tempRefresh")
            .addEventListener("click", async () => {
                const button = document.getElementById(
                    "tempRefresh"
                );

                button.disabled = true;
                button.textContent = "Refreshing...";

                await loadDashboardData();

                if (currentPage === "temperature") {
                    showTemperaturePage();
                }
            });
    }

    // ------------------------------------------------------
    // 4. CENTER SELECTION CARDS
    // ------------------------------------------------------

    function renderCenterCards() {
        const target = document.getElementById(
            "tempCenterCards"
        );

        target.replaceChildren();

        dataCenters.forEach(center => {
            const button = document.createElement("button");

            button.className = "temp-center-card";
            button.type = "button";

            if (center.id === selectedId) {
                button.classList.add("selected");
            }

            button.setAttribute(
                "aria-pressed",
                String(center.id === selectedId)
            );

            const name = document.createElement("strong");
            name.textContent = center.id;

            const city = document.createElement("small");
            city.textContent = center.city;

            const temperature = document.createElement("span");
            temperature.className = "temp-card-value";
            temperature.textContent =
                center.temperature.toFixed(2) + "°C";

            const label = document.createElement("small");
            label.textContent = "Daily average";

            button.append(name, city, temperature, label);

            button.addEventListener("click", () => {
                selectedId = center.id;

                renderCenterCards();
                renderSelectedDetails();
                updateChartHighlight();
            });

            target.appendChild(button);
        });
    }

    // ------------------------------------------------------
    // 5. SELECTED CENTER DETAILS
    // ------------------------------------------------------

    function renderSelectedDetails() {
        const center = dataCenters.find(
            c => c.id === selectedId
        );

        const target = document.getElementById(
            "tempSelectedDetails"
        );

        if (!center || !target) return;

        target.replaceChildren();

        const title = document.createElement("h3");
        title.className = "temp-detail-title";
        title.textContent = `${center.id} — ${center.city}`;

        const subtitle = document.createElement("p");
        subtitle.className = "temp-detail-subtitle";
        subtitle.textContent =
            `${center.region} Region · ${center.date}`;

        const grid = document.createElement("div");
        grid.className = "temp-detail-grid";

        const metrics = [
            ["Average Temperature",
                center.temperature.toFixed(2) + "°C"],

            ["Maximum Temperature",
                center.maxTemperature.toFixed(2) + "°C"],

            ["Temperature Gap",
                (
                    center.maxTemperature -
                    center.temperature
                ).toFixed(2) + "°C"],

            ["Average Humidity",
                center.humidity.toFixed(2) + "%"],

            ["Daily Sensor Readings",
                center.readings.toLocaleString("en-IN")],

            ["Critical Reading Rate",
                (
                    center.readings > 0
                        ? center.critical / center.readings * 100
                        : 0
                ).toFixed(2) + "%"]
        ];

        metrics.forEach(([label, value]) => {
            const card = document.createElement("div");
            card.className = "temp-detail-metric";

            const name = document.createElement("span");
            name.textContent = label;

            const number = document.createElement("strong");
            number.textContent = value;

            card.append(name, number);
            grid.appendChild(card);
        });

        target.append(title, subtitle, grid);
    }

    // ------------------------------------------------------
    // 6. ACTUAL DATABRICKS CHARTS
    // ------------------------------------------------------

    function createCharts() {
        if (typeof Chart === "undefined") return;

        const styles = getComputedStyle(
            document.documentElement
        );

        const textColor =
            styles.getPropertyValue(
                "--text-secondary"
            ).trim() || "#57749f";

        const gridColor =
            styles.getPropertyValue(
                "--grid-color"
            ).trim() || "rgba(58,115,191,.12)";

        const labels = dataCenters.map(
            center => center.id
        );

        const sharedScales = () => ({
            x: {
                grid: { display: false },
                ticks: {
                    color: textColor,
                    font: { size: 9 }
                }
            },
            y: {
                beginAtZero: true,
                grid: { color: gridColor },
                ticks: {
                    color: textColor,
                    font: { size: 9 }
                }
            }
        });

        const averageChart = new Chart(
            document.getElementById("tempComparisonChart"),
            {
                type: "bar",
                data: {
                    labels,
                    datasets: [
                        {
                            label: "Daily Average",
                            data: dataCenters.map(
                                c => c.temperature
                            ),
                            backgroundColor: "#2786ff",
                            borderRadius: 3
                        },
                        {
                            label: "Daily Maximum",
                            data: dataCenters.map(
                                c => c.maxTemperature
                            ),
                            backgroundColor: "#ef6269",
                            borderRadius: 3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: textColor,
                                boxWidth: 10,
                                font: { size: 10 }
                            }
                        }
                    },
                    scales: sharedScales()
                }
            }
        );

        const gapChart = new Chart(
            document.getElementById("tempGapChart"),
            {
                type: "bar",
                data: {
                    labels,
                    datasets: [{
                        label: "Daily Temperature Gap",
                        data: dataCenters.map(
                            c => Number((
                                c.maxTemperature -
                                c.temperature
                            ).toFixed(2))
                        ),
                        backgroundColor: dataCenters.map(
                            c => c.id === selectedId
                                ? "#efad35"
                                : "#2786ff"
                        ),
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: sharedScales()
                }
            }
        );

        charts.push(averageChart, gapChart);
    }

    // ------------------------------------------------------
    // 7. SELECTED CHART HIGHLIGHT
    // ------------------------------------------------------

    function updateChartHighlight() {
        const gapChart = charts[1];

        if (!gapChart) return;

        gapChart.data.datasets[0].backgroundColor =
            dataCenters.map(
                c => c.id === selectedId
                    ? "#efad35"
                    : "#2786ff"
            );

        gapChart.update();
    }

    // ------------------------------------------------------
    // 8. CONNECT TO EXISTING SIDEBAR
    // ------------------------------------------------------

    document.addEventListener("click", event => {
        const nav = event.target.closest(".nav-item");

        if (nav) {
            if (nav.dataset.page === "temperature") {
                showTemperaturePage();
            } else {
                destroyTemperatureCharts();
                container.classList.remove(
                    "temp-page-active"
                );
            }

            return;
        }

        if (
            event.target.closest("#notificationButton") ||
            event.target.closest("#viewAllAlerts")
        ) {
            destroyTemperatureCharts();
            container.classList.remove(
                "temp-page-active"
            );
        }

        if (
            event.target.closest("#lightModeButton") ||
            event.target.closest("#darkModeButton")
        ) {
            if (currentPage === "temperature") {
                destroyTemperatureCharts();
                createCharts();
            }
        }
    });

})();


/* ==========================================================
   POWER & ENERGY ANALYTICS PAGE

   Source: Actual Databricks Gold daily aggregates
   Metric: average_power_kw

   IMPORTANT:
   - kW means power, not energy.
   - kWh consumption is not available in current Gold.
   - No fake hourly readings or savings percentages.

   ADD AT THE END OF frontend/script.js
========================================================== */

(() => {
    "use strict";

    const container = document.querySelector(
        "#secondaryPage .secondary-page-content"
    );

    if (!container) return;

    let selectedPowerCenter = null;
    let powerCharts = [];
    let powerPage = null;

    // ======================================================
    // 1. PREMIUM STYLING
    // ======================================================

    const style = document.createElement("style");

    style.id = "powerAnalyticsStyles";

    style.textContent = `

        .secondary-page-content.power-page-active {
            display: block;
            text-align: left;
            padding: 22px;
            min-height: 400px;
        }

        .power-workspace {
            width: 100%;
            color: var(--text-primary);
        }

        .power-intro {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 15px;
            margin-bottom: 20px;
        }

        .power-intro p {
            color: var(--text-secondary);
            font-size: 11px;
            line-height: 1.8;
            max-width: 650px;
        }

        .power-refresh {
            padding: 11px 16px;
            border: none;
            border-radius: 9px;
            background: linear-gradient(
                135deg,
                #0867ee,
                #438fff
            );
            color: white;
            font-weight: 800;
            font-size: 11px;
            box-shadow: 0 8px 20px rgba(8,103,238,.18);
            cursor: pointer;
        }

        .power-refresh:hover {
            filter: brightness(1.1);
        }

        .power-refresh:disabled {
            opacity: .6;
            cursor: wait;
        }

        /* TOP METRICS */

        .power-kpi-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0,1fr));
            gap: 13px;
            margin-bottom: 24px;
        }

        .power-kpi {
            position: relative;
            padding: 21px;
            border-radius: 13px;
            border: 1px solid var(--border-color);
            background: var(--card-bg);
            overflow: hidden;
            box-shadow: 0 8px 23px rgba(28,80,153,.05);
        }

        .power-kpi::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: #2786ff;
        }

        .power-kpi:nth-child(1) {
            background:
                linear-gradient(
                    125deg,
                    rgba(39,134,255,.09),
                    transparent
                ),
                var(--card-bg);
        }

        .power-kpi:nth-child(2) {
            background:
                linear-gradient(
                    125deg,
                    rgba(244,181,68,.11),
                    transparent
                ),
                var(--card-bg);
        }

        .power-kpi:nth-child(2)::before {
            background: #f4b544;
        }

        .power-kpi:nth-child(3) {
            background:
                linear-gradient(
                    125deg,
                    rgba(152,100,255,.09),
                    transparent
                ),
                var(--card-bg);
        }

        .power-kpi:nth-child(3)::before {
            background: #9864ff;
        }

        .power-kpi-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }

        .power-kpi-heading span {
            color: var(--text-secondary);
            font-size: 11px;
        }

        .power-kpi-heading i {
            font-size: 18px;
            color: var(--primary-blue);
        }

        .power-kpi:nth-child(2) .power-kpi-heading i {
            color: #f4b544;
        }

        .power-kpi:nth-child(3) .power-kpi-heading i {
            color: #9864ff;
        }

        .power-kpi strong {
            display: block;
            font-size: clamp(22px,2.4vw,29px);
            font-weight: 800;
            margin-top: 12px;
            color: var(--text-primary);
        }

        .power-kpi small {
            display: block;
            color: var(--text-muted);
            font-size: 10px;
            margin-top: 7px;
        }

        /* SECTION TITLES */

        .power-section-title {
            margin: 24px 0 14px;
            font-size: 16px;
            font-weight: 800;
            color: var(--text-primary);
        }

        /* CENTER CARDS */

        .power-centers-grid {
            display: grid;
            grid-template-columns: repeat(5,minmax(0,1fr));
            gap: 12px;
        }

        .power-center-card {
            text-align: left;
            min-width: 0;
            padding: 16px;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            background:
                linear-gradient(
                    145deg,
                    rgba(35,124,255,.04),
                    transparent
                ),
                var(--card-bg);
            color: var(--text-primary);
            cursor: pointer;
            transition:
                transform .2s,
                border-color .2s,
                box-shadow .2s;
        }

        .power-center-card:hover {
            transform: translateY(-4px);
            border-color: var(--primary-blue);
            box-shadow: 0 12px 25px rgba(8,103,238,.12);
        }

        .power-center-card.selected {
            border: 2px solid var(--primary-blue);
            background:
                linear-gradient(
                    145deg,
                    rgba(35,124,255,.13),
                    rgba(244,181,68,.06)
                ),
                var(--card-bg);
        }

        .power-center-card:focus-visible {
            outline: 2px solid var(--primary-blue);
            outline-offset: 2px;
        }

        .power-card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }

        .power-card-header strong {
            font-size: 13px;
        }

        .power-card-header i {
            width: 30px;
            height: 30px;
            display: grid;
            place-items: center;
            background: rgba(244,181,68,.13);
            color: #e8a226;
            border-radius: 8px;
            font-size: 15px;
        }

        .power-card-city {
            display: block;
            color: var(--text-secondary);
            font-size: 10px;
            margin-top: 10px;
        }

        .power-card-value {
            display: block;
            font-size: 21px;
            font-weight: 800;
            margin-top: 13px;
            color: var(--text-primary);
        }

        .power-card-caption {
            display: block;
            color: var(--text-muted);
            font-size: 9px;
            margin-top: 5px;
        }

        /* CENTER DETAILS */

        .power-details {
            margin-top: 21px;
            padding: 22px;
            border-radius: 14px;
            border: 1px solid var(--border-color);
            background:
                linear-gradient(
                    135deg,
                    rgba(35,124,255,.045),
                    transparent 75%
                ),
                var(--card-bg);
        }

        .power-details-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
            flex-wrap: wrap;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border-color);
        }

        .power-details-header h3 {
            font-size: 18px;
            font-weight: 800;
            color: var(--text-primary);
        }

        .power-details-header p {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 7px;
        }

        .power-share-badge {
            padding: 10px 13px;
            border-radius: 9px;
            background: rgba(244,181,68,.12);
            color: #d99b29;
            font-size: 11px;
            font-weight: 800;
        }

        .power-detail-grid {
            display: grid;
            grid-template-columns: repeat(4,minmax(0,1fr));
            gap: 12px;
            margin-top: 18px;
        }

        .power-detail-metric {
            padding: 15px;
            border-radius: 10px;
            border: 1px solid var(--border-color);
            background: var(--card-subtle);
        }

        .power-detail-metric span {
            display: block;
            color: var(--text-secondary);
            font-size: 10px;
            line-height: 1.5;
        }

        .power-detail-metric strong {
            display: block;
            color: var(--text-primary);
            margin-top: 9px;
            font-size: 17px;
            font-weight: 800;
            overflow-wrap: anywhere;
        }

        .power-detail-metric:nth-child(2) strong {
            color: #dca22f;
        }

        .power-detail-metric:nth-child(4) strong {
            color: var(--primary-blue);
        }

        /* CHARTS */

        .power-chart-grid {
            display: grid;
            grid-template-columns: repeat(2,minmax(0,1fr));
            gap: 13px;
        }

        .power-chart-panel {
            min-width: 0;
            padding: 18px;
            border: 1px solid var(--border-color);
            border-radius: 13px;
            background: var(--card-bg);
        }

        .power-chart-panel:first-child {
            border-top: 3px solid #2385ff;
        }

        .power-chart-panel:last-child {
            border-top: 3px solid #f4b544;
        }

        .power-chart-panel h4 {
            font-size: 12px;
            font-weight: 800;
        }

        .power-chart-panel p {
            color: var(--text-secondary);
            font-size: 10px;
            margin-top: 6px;
        }

        .power-chart-wrap {
            position: relative;
            height: 250px;
            margin-top: 16px;
        }

        .power-chart-wrap canvas {
            display: block;
            max-width: 100%;
        }

        /* COMPARISON TABLE */

        .power-table-wrap {
            overflow-x: auto;
            border: 1px solid var(--border-color);
            border-radius: 11px;
        }

        .power-table {
            width: 100%;
            border-collapse: collapse;
        }

        .power-table th {
            background: var(--card-subtle);
            color: var(--text-secondary);
            padding: 13px;
            font-size: 10px;
            text-align: left;
            white-space: nowrap;
        }

        .power-table td {
            padding: 13px;
            border-bottom: 1px solid var(--border-color);
            color: var(--text-primary);
            font-size: 11px;
            white-space: nowrap;
        }

        .power-table tbody tr:last-child td {
            border-bottom: none;
        }

        .power-table tbody tr:hover {
            background: var(--card-hover);
        }

        .power-table .power-selected-row {
            background: rgba(35,124,255,.09);
        }

        .power-note {
            margin-top: 20px;
            padding: 14px 16px;
            border-left: 3px solid var(--primary-blue);
            border-radius: 8px;
            color: var(--text-secondary);
            background: var(--card-subtle);
            font-size: 10px;
            line-height: 1.8;
        }

        @media (max-width: 1100px) {
            .power-centers-grid {
                grid-template-columns: repeat(3,minmax(0,1fr));
            }
        }

        @media (max-width: 700px) {
            .power-kpi-grid,
            .power-chart-grid {
                grid-template-columns: 1fr;
            }

            .power-centers-grid,
            .power-detail-grid {
                grid-template-columns: repeat(2,minmax(0,1fr));
            }

            .secondary-page-content.power-page-active {
                padding: 13px;
            }

            .power-details {
                padding: 15px;
            }
        }

        @media (max-width: 410px) {
            .power-centers-grid,
            .power-detail-grid {
                grid-template-columns: 1fr;
            }
        }
    `;

    document.head.appendChild(style);

    // ======================================================
    // 2. HELPER FUNCTIONS
    // ======================================================

    function format(value) {
        return Number(value || 0).toLocaleString("en-IN");
    }

    function create(tag, className = "", text = null) {
        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== null) {
            element.textContent = String(text);
        }

        return element;
    }

    function getSelectedCenter() {
        return dataCenters.find(
            center => center.id === selectedPowerCenter
        );
    }

    function combinedPower() {
        return dataCenters.reduce(
            (total, center) => total + center.power,
            0
        );
    }

    // ======================================================
    // 3. DESTROY OLD CHART INSTANCES
    // ======================================================

    function destroyPowerCharts() {
        powerCharts.forEach(chart => {
            chart.destroy();
        });

        powerCharts = [];
    }

    // ======================================================
    // 4. CREATE PAGE LAYOUT
    // ======================================================

    function buildPowerPage() {
        const page = create(
            "div",
            "power-workspace"
        );

        page.innerHTML = `
            <div class="power-intro">

                <p>
                    Analyze actual daily average power
                    across all monitored data centers.
                    Compare power demand, temperature
                    and location-level contributions.
                </p>

                <button
                    class="power-refresh"
                    id="powerRefresh"
                >
                    <i class="fa-solid fa-rotate"></i>
                    Refresh Power Data
                </button>

            </div>

            <div class="power-kpi-grid">

                <article class="power-kpi">
                    <div class="power-kpi-heading">
                        <span>Combined Average Power</span>
                        <i class="fa-solid fa-bolt"></i>
                    </div>

                    <strong id="powerTotal">—</strong>

                    <small>
                        Sum of per-center daily average kW
                    </small>
                </article>

                <article class="power-kpi">
                    <div class="power-kpi-heading">
                        <span>Highest Average Power</span>
                        <i class="fa-solid fa-gauge-high"></i>
                    </div>

                    <strong id="powerHighest">—</strong>

                    <small id="powerHighestCenter">
                        Highest center average
                    </small>
                </article>

                <article class="power-kpi">
                    <div class="power-kpi-heading">
                        <span>Average Power per Center</span>
                        <i class="fa-solid fa-chart-column"></i>
                    </div>

                    <strong id="powerAverage">—</strong>

                    <small>
                        Average of center-level daily averages
                    </small>
                </article>

            </div>

            <h3 class="power-section-title">
                Select a Data Center
            </h3>

            <div
                class="power-centers-grid"
                id="powerCenterCards"
            ></div>

            <div
                class="power-details"
                id="powerSelectedDetails"
            ></div>

            <h3 class="power-section-title">
                Power Analytics
            </h3>

            <div class="power-chart-grid">

                <article class="power-chart-panel">
                    <h4>
                        Average Power by Data Center
                    </h4>

                    <p>
                        Actual Gold data · kW
                    </p>

                    <div class="power-chart-wrap">
                        <canvas id="powerPageBarChart"></canvas>
                    </div>
                </article>

                <article class="power-chart-panel">
                    <h4>
                        Temperature vs Power
                    </h4>

                    <p>
                        Daily averages by data center
                    </p>

                    <div class="power-chart-wrap">
                        <canvas id="powerPageScatterChart"></canvas>
                    </div>
                </article>

            </div>

            <h3 class="power-section-title">
                Data Center Power Comparison
            </h3>

            <div class="power-table-wrap">
                <table class="power-table">

                    <thead>
                        <tr>
                            <th>Data Center</th>
                            <th>City</th>
                            <th>Avg Power (kW)</th>
                            <th>Share of Combined Avg</th>
                            <th>Avg Temperature</th>
                        </tr>
                    </thead>

                    <tbody id="powerComparisonBody"></tbody>

                </table>
            </div>

            <div class="power-note">
                <i class="fa-solid fa-circle-info"></i>
                Power values are actual daily averages
                from Databricks Gold. The percentage share
                uses each center's average kW divided by the
                sum of center averages.

                Energy consumption in kWh, electricity cost
                and power usage effectiveness (PUE)
                cannot be calculated reliably from the
                available Gold metrics alone.
            </div>
        `;

        page.querySelector("#powerRefresh")
            .addEventListener("click", async () => {
                const button = page.querySelector(
                    "#powerRefresh"
                );

                button.disabled = true;
                button.textContent = "Refreshing...";

                try {
                    await loadDashboardData();

                    if (currentPage === "power") {
                        showPowerPage();
                    }
                } finally {
                    button.disabled = false;

                    button.textContent =
                        "↻ Refresh Power Data";
                }
            });

        return page;
    }

    // ======================================================
    // 5. TOP POWER METRICS
    // ======================================================

    function updatePowerKPIs() {
        const total = combinedPower();

        const count = dataCenters.length;

        const highest = [...dataCenters].sort(
            (a, b) => b.power - a.power
        )[0];

        powerPage.querySelector("#powerTotal")
            .textContent =
                total.toFixed(2) + " kW";

        powerPage.querySelector("#powerAverage")
            .textContent =
                (count ? total / count : 0)
                .toFixed(2) + " kW";

        powerPage.querySelector("#powerHighest")
            .textContent =
                (highest?.power || 0).toFixed(2) + " kW";

        powerPage.querySelector("#powerHighestCenter")
            .textContent = highest
                ? `${highest.id} · ${highest.city}`
                : "No data";
    }

    // ======================================================
    // 6. DATA CENTER SELECTION CARDS
    // ======================================================

    function renderPowerCenterCards() {
        const target = powerPage.querySelector(
            "#powerCenterCards"
        );

        target.replaceChildren();

        dataCenters.forEach(center => {
            const button = create(
                "button",
                "power-center-card"
            );

            button.type = "button";

            if (center.id === selectedPowerCenter) {
                button.classList.add("selected");
            }

            button.setAttribute(
                "aria-pressed",
                String(center.id === selectedPowerCenter)
            );

            const header = create(
                "div",
                "power-card-header"
            );

            header.appendChild(
                create("strong", "", center.id)
            );

            const icon = create(
                "i",
                "fa-solid fa-bolt"
            );

            header.appendChild(icon);

            button.appendChild(header);

            button.appendChild(
                create(
                    "span",
                    "power-card-city",
                    center.city
                )
            );

            button.appendChild(
                create(
                    "span",
                    "power-card-value",
                    center.power.toFixed(2) + " kW"
                )
            );

            button.appendChild(
                create(
                    "span",
                    "power-card-caption",
                    "Daily average power"
                )
            );

            button.addEventListener("click", () => {
                selectedPowerCenter = center.id;

                renderPowerCenterCards();
                renderPowerDetails();
                renderPowerTable();
                updatePowerChartHighlight();
            });

            target.appendChild(button);
        });
    }

    // ======================================================
    // 7. SELECTED CENTER DETAILS
    // ======================================================

    function renderPowerDetails() {
        const target = powerPage.querySelector(
            "#powerSelectedDetails"
        );

        target.replaceChildren();

        const center = getSelectedCenter();

        if (!center) return;

        const total = combinedPower();

        const fleetAverage = dataCenters.length
            ? total / dataCenters.length
            : 0;

        const share = total > 0
            ? center.power / total * 100
            : 0;

        const difference =
            center.power - fleetAverage;

        const header = create(
            "div",
            "power-details-header"
        );

        const heading = create("div");

        heading.appendChild(
            create(
                "h3",
                "",
                `${center.id} — ${center.city}`
            )
        );

        heading.appendChild(
            create(
                "p",
                "",
                `${center.region} Region · ${center.date}`
            )
        );

        header.appendChild(heading);

        header.appendChild(
            create(
                "span",
                "power-share-badge",
                share.toFixed(2) + "% Combined Share"
            )
        );

        target.appendChild(header);

        const grid = create(
            "div",
            "power-detail-grid"
        );

        const metrics = [
            [
                "Average Power",
                center.power.toFixed(2) + " kW"
            ],
            [
                "Share of Combined Average",
                share.toFixed(2) + "%"
            ],
            [
                "Difference from Center Average",
                (
                    difference >= 0 ? "+" : ""
                ) + difference.toFixed(2) + " kW"
            ],
            [
                "Average Temperature",
                center.temperature.toFixed(2) + "°C"
            ],
            [
                "Maximum Temperature",
                center.maxTemperature.toFixed(2) + "°C"
            ],
            [
                "Average Humidity",
                center.humidity.toFixed(2) + "%"
            ],
            [
                "Sensor Readings",
                format(center.readings)
            ],
            [
                "Critical Reading Rate",
                (
                    center.readings > 0
                        ? center.critical /
                          center.readings * 100
                        : 0
                ).toFixed(2) + "%"
            ]
        ];

        metrics.forEach(([label, value]) => {
            const card = create(
                "div",
                "power-detail-metric"
            );

            card.appendChild(
                create("span", "", label)
            );

            card.appendChild(
                create("strong", "", value)
            );

            grid.appendChild(card);
        });

        target.appendChild(grid);
    }

    // ======================================================
    // 8. POWER COMPARISON TABLE
    // ======================================================

    function renderPowerTable() {
        const tbody = powerPage.querySelector(
            "#powerComparisonBody"
        );

        tbody.replaceChildren();

        const total = combinedPower();

        const sorted = [...dataCenters].sort(
            (a, b) => b.power - a.power
        );

        sorted.forEach(center => {
            const row = create("tr");

            if (center.id === selectedPowerCenter) {
                row.classList.add("power-selected-row");
            }

            const share = total > 0
                ? center.power / total * 100
                : 0;

            [
                center.id,
                center.city,
                center.power.toFixed(2) + " kW",
                share.toFixed(2) + "%",
                center.temperature.toFixed(2) + "°C"
            ].forEach(value => {
                row.appendChild(
                    create("td", "", value)
                );
            });

            tbody.appendChild(row);
        });
    }

    // ======================================================
    // 9. CHART CONFIGURATION
    // ======================================================

    function chartTheme() {
        const css = getComputedStyle(
            document.documentElement
        );

        return {
            text:
                css.getPropertyValue(
                    "--text-secondary"
                ).trim() || "#57749f",

            grid:
                css.getPropertyValue(
                    "--grid-color"
                ).trim() || "rgba(58,115,191,.12)",

            blue:
                css.getPropertyValue(
                    "--primary-blue"
                ).trim() || "#0867ee"
        };
    }

    function commonScales() {
        const theme = chartTheme();

        return {
            x: {
                grid: { display: false },
                ticks: {
                    color: theme.text,
                    font: { size: 9 }
                }
            },

            y: {
                grid: { color: theme.grid },
                ticks: {
                    color: theme.text,
                    font: { size: 9 }
                }
            }
        };
    }

    // ======================================================
    // 10. CREATE POWER CHARTS
    // ======================================================

    function createPowerCharts() {
        if (
            typeof Chart === "undefined" ||
            !powerPage ||
            !container.contains(powerPage)
        ) {
            return;
        }

        destroyPowerCharts();

        const theme = chartTheme();

        const barCanvas = powerPage.querySelector(
            "#powerPageBarChart"
        );

        const scatterCanvas = powerPage.querySelector(
            "#powerPageScatterChart"
        );

        const barChart = new Chart(barCanvas, {
            type: "bar",

            data: {
                labels: dataCenters.map(c => c.id),

                datasets: [{
                    label: "Average Power (kW)",

                    data: dataCenters.map(c => c.power),

                    backgroundColor: dataCenters.map(c =>
                        c.id === selectedPowerCenter
                            ? "#f4b544"
                            : theme.blue
                    ),

                    borderRadius: 5,
                    maxBarThickness: 30
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                plugins: {
                    legend: { display: false },

                    tooltip: {
                        callbacks: {
                            label(context) {
                                return (
                                    context.parsed.y.toFixed(2)
                                    + " kW"
                                );
                            }
                        }
                    }
                },

                scales: {
                    x: {
                        ...commonScales().x,

                        ticks: {
                            color: theme.text,
                            font: { size: 8 }
                        }
                    },

                    y: {
                        ...commonScales().y,
                        beginAtZero: true
                    }
                }
            }
        });

        const scatterChart = new Chart(scatterCanvas, {
            type: "scatter",

            data: {
                datasets: [{
                    label: "Data Centers",

                    data: dataCenters.map(c => ({
                        x: c.temperature,
                        y: c.power,
                        id: c.id,
                        city: c.city
                    })),

                    backgroundColor: dataCenters.map(c =>
                        c.id === selectedPowerCenter
                            ? "#f4b544"
                            : theme.blue
                    ),

                    pointRadius: dataCenters.map(c =>
                        c.id === selectedPowerCenter
                            ? 8
                            : 5
                    ),

                    pointHoverRadius: 9
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                plugins: {
                    legend: { display: false },

                    tooltip: {
                        callbacks: {
                            title(items) {
                                const item = items[0]?.raw;

                                return item
                                    ? `${item.id} — ${item.city}`
                                    : "";
                            },

                            label(context) {
                                return (
                                    context.parsed.x.toFixed(2)
                                    + "°C | "
                                    + context.parsed.y.toFixed(2)
                                    + " kW"
                                );
                            }
                        }
                    }
                },

                scales: {
                    x: {
                        ...commonScales().x,

                        type: "linear",

                        title: {
                            display: true,
                            text: "Avg Temperature (°C)",
                            color: theme.text
                        }
                    },

                    y: {
                        ...commonScales().y,

                        title: {
                            display: true,
                            text: "Avg Power (kW)",
                            color: theme.text
                        }
                    }
                }
            }
        });

        powerCharts.push(barChart, scatterChart);
    }

    // ======================================================
    // 11. UPDATE SELECTED CENTER IN CHARTS
    // ======================================================

    function updatePowerChartHighlight() {
        if (powerCharts.length !== 2) return;

        const theme = chartTheme();

        const bar = powerCharts[0];
        const scatter = powerCharts[1];

        const highlights = dataCenters.map(c =>
            c.id === selectedPowerCenter
                ? "#f4b544"
                : theme.blue
        );

        bar.data.datasets[0].backgroundColor =
            highlights;

        scatter.data.datasets[0].backgroundColor =
            highlights;

        scatter.data.datasets[0].pointRadius =
            dataCenters.map(c =>
                c.id === selectedPowerCenter ? 8 : 5
            );

        bar.update();
        scatter.update();
    }

    // ======================================================
    // 12. SHOW COMPLETE POWER PAGE
    // ======================================================

    function showPowerPage() {
        destroyPowerCharts();

        if (!dataCenters.length) {
            container.textContent =
                "Waiting for Databricks data...";
            return;
        }

        if (
            !selectedPowerCenter ||
            !getSelectedCenter()
        ) {
            selectedPowerCenter = dataCenters[0].id;
        }

        container.classList.add(
            "power-page-active"
        );

        powerPage = buildPowerPage();

        container.replaceChildren(powerPage);

        updatePowerKPIs();
        renderPowerCenterCards();
        renderPowerDetails();
        renderPowerTable();

        requestAnimationFrame(() => {
            createPowerCharts();
        });
    }

    // ======================================================
    // 13. CONNECT TO EXISTING NAVIGATION
    // ======================================================

    document.addEventListener("click", event => {
        const nav = event.target.closest(".nav-item");

        if (nav) {
            if (nav.dataset.page === "power") {
                showPowerPage();
            } else {
                destroyPowerCharts();

                container.classList.remove(
                    "power-page-active"
                );

                powerPage = null;
            }

            return;
        }

        if (
            event.target.closest("#notificationButton") ||
            event.target.closest("#viewAllAlerts")
        ) {
            destroyPowerCharts();

            container.classList.remove(
                "power-page-active"
            );

            powerPage = null;
        }

        if (
            event.target.closest("#lightModeButton") ||
            event.target.closest("#darkModeButton")
        ) {
            if (
                currentPage === "power" &&
                powerPage &&
                container.contains(powerPage)
            ) {
                requestAnimationFrame(() => {
                    createPowerCharts();
                });
            }
        }
    });

})();


/* ==========================================================
   COOLING SYSTEMS INTELLIGENCE
   Source: Databricks Gold daily aggregates

   ADD AT THE VERY END OF frontend/script.js
   Do not delete existing code.
========================================================== */

(() => {
    "use strict";

    const container = document.querySelector(
        "#secondaryPage .secondary-page-content"
    );

    if (!container) return;

    let selectedId = null;
    let page = null;
    let charts = [];
    let refreshing = false;

    // ======================================================
    // 1. PREMIUM COLORS AND RESPONSIVE STYLING
    // ======================================================

    const style = document.createElement("style");

    style.id = "coolingIntelligenceStyles";

    style.textContent = `
        .secondary-page-content.coolx-active {
            display: block;
            padding: 22px;
            text-align: left;
            min-height: 400px;
        }

        .coolx-page {
            width: 100%;
            color: var(--text-primary);
        }

        .coolx-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 15px;
            flex-wrap: wrap;
            margin-bottom: 20px;
        }

        .coolx-toolbar p,
        .coolx-muted {
            font-size: 11px;
            line-height: 1.7;
            color: var(--text-secondary);
        }

        .coolx-refresh {
            border: none;
            border-radius: 9px;
            padding: 11px 16px;
            color: #fff;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
            background: linear-gradient(135deg, #126cef, #418cff);
            box-shadow: 0 7px 20px rgba(18,108,239,.18);
        }

        .coolx-refresh:disabled {
            opacity: .6;
            cursor: wait;
        }

        .coolx-kpis {
            display: grid;
            grid-template-columns: repeat(4, minmax(0,1fr));
            gap: 13px;
            margin-bottom: 25px;
        }

        .coolx-kpi {
            min-width: 0;
            padding: 19px 16px;
            border: 1px solid var(--border-color);
            border-radius: 13px;
            background: var(--card-bg);
            box-shadow: 0 7px 22px rgba(31,79,150,.045);
            position: relative;
            overflow: hidden;
        }

        .coolx-kpi::before {
            content: "";
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            background: #2786ff;
        }

        .coolx-kpi:nth-child(1) {
            background:
                linear-gradient(125deg, rgba(39,134,255,.09), transparent),
                var(--card-bg);
        }

        .coolx-kpi:nth-child(2) {
            background:
                linear-gradient(125deg, rgba(238,98,109,.09), transparent),
                var(--card-bg);
        }

        .coolx-kpi:nth-child(2)::before {
            background: #ef6570;
        }

        .coolx-kpi:nth-child(3) {
            background:
                linear-gradient(125deg, rgba(18,186,192,.09), transparent),
                var(--card-bg);
        }

        .coolx-kpi:nth-child(3)::before {
            background: #14b8bd;
        }

        .coolx-kpi:nth-child(4) {
            background:
                linear-gradient(125deg, rgba(243,181,67,.12), transparent),
                var(--card-bg);
        }

        .coolx-kpi:nth-child(4)::before {
            background: #efb13d;
        }

        .coolx-kpi span {
            display: block;
            font-size: 10px;
            color: var(--text-secondary);
        }

        .coolx-kpi strong {
            display: block;
            font-size: clamp(19px,2vw,26px);
            font-weight: 800;
            margin-top: 11px;
            color: var(--text-primary);
            overflow-wrap: anywhere;
        }

        .coolx-kpi small {
            display: block;
            margin-top: 8px;
            font-size: 9px;
            color: var(--text-secondary);
        }

        .coolx-title {
            margin: 24px 0 14px;
            font-weight: 800;
            font-size: 16px;
            color: var(--text-primary);
        }

        .coolx-center-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0,1fr));
            gap: 11px;
        }

        .coolx-center {
            text-align: left;
            color: var(--text-primary);
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 15px 13px;
            min-width: 0;
            cursor: pointer;
            transition: transform .2s, border-color .2s, box-shadow .2s;
        }

        .coolx-center:hover {
            transform: translateY(-4px);
            border-color: #2786ff;
            box-shadow: 0 10px 23px rgba(39,134,255,.11);
        }

        .coolx-center.selected {
            border: 2px solid #2786ff;
            background:
                linear-gradient(135deg, rgba(39,134,255,.12),
                    rgba(20,184,189,.055)),
                var(--card-bg);
        }

        .coolx-center:focus-visible,
        .coolx-table-button:focus-visible {
            outline: 2px solid #2786ff;
            outline-offset: 2px;
        }

        .coolx-center-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .coolx-center-top strong {
            font-size: 13px;
        }

        .coolx-center-top i {
            color: #0eacc4;
            padding: 8px;
            border-radius: 8px;
            background: rgba(14,172,196,.10);
        }

        .coolx-center-city {
            display: block;
            font-size: 10px;
            margin-top: 10px;
            color: var(--text-secondary);
        }

        .coolx-center-value {
            display: block;
            margin-top: 13px;
            font-size: 19px;
            font-weight: 800;
            color: #0eacc4;
        }

        .coolx-center-caption {
            display: block;
            font-size: 9px;
            margin-top: 5px;
            color: var(--text-secondary);
        }

        .coolx-details {
            margin-top: 21px;
            padding: 21px;
            border: 1px solid var(--border-color);
            border-radius: 14px;
            background:
                linear-gradient(145deg, rgba(39,134,255,.045), transparent),
                var(--card-bg);
        }

        .coolx-details-heading {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 14px;
            flex-wrap: wrap;
            padding-bottom: 17px;
            border-bottom: 1px solid var(--border-color);
        }

        .coolx-details-heading h3 {
            font-size: 18px;
            font-weight: 800;
        }

        .coolx-details-heading p {
            margin-top: 7px;
            font-size: 11px;
            color: var(--text-secondary);
        }

        .coolx-rank {
            color: #0aa4bb;
            background: rgba(14,172,196,.10);
            border: 1px solid rgba(14,172,196,.18);
            padding: 9px 12px;
            border-radius: 9px;
            font-size: 10px;
            font-weight: 800;
        }

        .coolx-details-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0,1fr));
            gap: 12px;
            margin-top: 19px;
        }

        .coolx-detail-metric {
            padding: 15px;
            background: var(--card-subtle);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            min-width: 0;
        }

        .coolx-detail-metric span {
            display: block;
            font-size: 10px;
            line-height: 1.5;
            color: var(--text-secondary);
        }

        .coolx-detail-metric strong {
            display: block;
            font-size: 17px;
            font-weight: 800;
            margin-top: 9px;
            color: var(--text-primary);
            overflow-wrap: anywhere;
        }

        .coolx-detail-metric:nth-child(4n+1) strong {
            color: #1681f7;
        }

        .coolx-detail-metric:nth-child(4n+2) strong {
            color: #e96872;
        }

        .coolx-detail-metric:nth-child(4n+3) strong {
            color: #09aeb8;
        }

        .coolx-detail-metric:nth-child(4n+4) strong {
            color: #dba130;
        }

        .coolx-chart-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0,1fr));
            gap: 13px;
            margin-top: 15px;
        }

        .coolx-chart-card {
            min-width: 0;
            padding: 18px;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            background: var(--card-bg);
        }

        .coolx-chart-card:first-child {
            border-top: 3px solid #15b5bd;
        }

        .coolx-chart-card:last-child {
            border-top: 3px solid #efb13d;
        }

        .coolx-chart-card h4 {
            font-size: 12px;
            font-weight: 800;
        }

        .coolx-chart-card p {
            font-size: 10px;
            color: var(--text-secondary);
            margin-top: 6px;
        }

        .coolx-chart-wrap {
            height: 245px;
            position: relative;
            margin-top: 15px;
        }

        .coolx-chart-wrap canvas {
            display: block;
            max-width: 100%;
        }

        .coolx-table-wrap {
            border: 1px solid var(--border-color);
            border-radius: 11px;
            overflow-x: auto;
        }

        .coolx-table {
            width: 100%;
            border-collapse: collapse;
        }

        .coolx-table th {
            background: var(--card-subtle);
            color: var(--text-secondary);
            text-align: left;
            padding: 13px;
            font-size: 10px;
            white-space: nowrap;
        }

        .coolx-table td {
            padding: 13px;
            font-size: 11px;
            color: var(--text-primary);
            white-space: nowrap;
            border-bottom: 1px solid var(--border-color);
        }

        .coolx-table tr:last-child td {
            border-bottom: none;
        }

        .coolx-table .coolx-selected-row {
            background: rgba(39,134,255,.08);
        }

        .coolx-table-button {
            color: var(--primary-blue);
            background: transparent;
            border: none;
            text-align: left;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
        }

        .coolx-note,
        .coolx-insight {
            margin-top: 18px;
            padding: 14px 16px;
            border-radius: 9px;
            font-size: 10px;
            line-height: 1.8;
            color: var(--text-secondary);
            background: var(--card-subtle);
            border-left: 3px solid #2786ff;
        }

        .coolx-insight {
            border-left-color: #efb13d;
            background:
                linear-gradient(
                    110deg,
                    rgba(239,177,61,.07),
                    transparent
                ),
                var(--card-bg);
        }

        @media (max-width: 1150px) {
            .coolx-center-grid {
                grid-template-columns: repeat(3, minmax(0,1fr));
            }
        }

        @media (max-width: 800px) {
            .coolx-kpis {
                grid-template-columns: repeat(2, minmax(0,1fr));
            }

            .coolx-chart-grid {
                grid-template-columns: 1fr;
            }

            .coolx-details-grid {
                grid-template-columns: repeat(2, minmax(0,1fr));
            }
        }

        @media (max-width: 600px) {
            .coolx-center-grid {
                grid-template-columns: repeat(2, minmax(0,1fr));
            }

            .secondary-page-content.coolx-active {
                padding: 12px;
            }
        }

        @media (max-width: 410px) {
            .coolx-kpis,
            .coolx-center-grid,
            .coolx-details-grid {
                grid-template-columns: 1fr;
            }
        }
    `;

    document.head.appendChild(style);

    // ======================================================
    // 2. HELPERS
    // ======================================================

    const fmt = value =>
        Number(value || 0).toLocaleString("en-IN");

    const rate = (part, total) =>
        total > 0 ? (part / total) * 100 : 0;

    function element(tag, className = "", text = null) {
        const item = document.createElement(tag);

        item.className = className;

        if (text !== null) {
            item.textContent = String(text);
        }

        return item;
    }

    function getCenters() {
        return typeof dataCenters !== "undefined"
            ? dataCenters
            : [];
    }

    function selectedCenter() {
        return getCenters().find(
            center => center.id === selectedId
        );
    }

    function sum(field) {
        return getCenters().reduce(
            (total, center) =>
                total + Number(center[field] || 0),
            0
        );
    }

    function rankedCenters() {
        return [...getCenters()].sort((a, b) =>
            rate(b.coolingDegraded, b.readings) -
            rate(a.coolingDegraded, a.readings)
        );
    }

    // ======================================================
    // 3. CHART CLEANUP
    // ======================================================

    function destroyCoolingCharts() {
        charts.forEach(chart => chart.destroy());
        charts = [];
    }

    // ======================================================
    // 4. BUILD COOLING PAGE
    // ======================================================

    function buildPage() {
        const root = element(
            "div",
            "coolx-page"
        );

        root.innerHTML = `
            <div class="coolx-toolbar">
                <p>
                    Explore historical daily cooling indicators
                    from actual Databricks Gold sensor readings.
                </p>

                <button
                    class="coolx-refresh"
                    id="coolxRefresh"
                    type="button"
                >
                    <i class="fa-solid fa-rotate"></i>
                    Refresh Cooling Data
                </button>
            </div>

            <div class="coolx-kpis">
                <article class="coolx-kpi">
                    <span>Cooling Degraded Readings</span>
                    <strong id="coolxTotalDegraded">—</strong>
                    <small>Aggregated daily count</small>
                </article>

                <article class="coolx-kpi">
                    <span>Cooling Failure Readings</span>
                    <strong id="coolxTotalFailures">—</strong>
                    <small>Not unique failure incidents</small>
                </article>

                <article class="coolx-kpi">
                    <span>Cooling Degradation Rate</span>
                    <strong id="coolxDegradedRate">—</strong>
                    <small>Degraded / total readings</small>
                </article>

                <article class="coolx-kpi">
                    <span>Monitored Data Centers</span>
                    <strong id="coolxCenterCount">—</strong>
                    <small id="coolxDate">Latest Gold date</small>
                </article>
            </div>

            <h3 class="coolx-title">
                Select a Data Center
            </h3>

            <div
                class="coolx-center-grid"
                id="coolxCards"
            ></div>

            <div
                class="coolx-details"
                id="coolxDetails"
            ></div>

            <h3 class="coolx-title">
                Cooling Performance Comparison
            </h3>

            <div class="coolx-chart-grid">
                <article class="coolx-chart-card">
                    <h4>Cooling Degradation Rate</h4>
                    <p>
                        Percentage of daily readings ·
                        ranked highest first
                    </p>

                    <div class="coolx-chart-wrap">
                        <canvas id="coolxRateChart"></canvas>
                    </div>
                </article>

                <article class="coolx-chart-card">
                    <h4>Cooling Failure vs Degraded</h4>
                    <p>
                        Actual daily reading counts by center
                    </p>

                    <div class="coolx-chart-wrap">
                        <canvas id="coolxCountChart"></canvas>
                    </div>
                </article>
            </div>

            <h3 class="coolx-title">
                Center-wise Cooling Ranking
            </h3>

            <div class="coolx-table-wrap">
                <table class="coolx-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Data Center</th>
                            <th>City</th>
                            <th>Degraded Readings</th>
                            <th>Degradation Rate</th>
                            <th>Failure Readings</th>
                            <th>Failure Rate</th>
                        </tr>
                    </thead>

                    <tbody id="coolxTableBody"></tbody>
                </table>
            </div>

            <div
                class="coolx-insight"
                id="coolxDataInsight"
            ></div>

            <div class="coolx-note">
                <strong>Data source:</strong>
                Databricks Gold daily aggregate.

                Cooling degradation and failure rates are
                calculated against total daily sensor readings.
                They are descriptive historical rates, not
                cooling efficiency, equipment availability
                or live incident counts.
            </div>
        `;

        root.querySelector("#coolxRefresh")
            .addEventListener("click", refreshCooling);

        root.querySelector("#coolxCards")
            .addEventListener("click", event => {
                const button = event.target.closest(
                    "[data-cooling-id]"
                );

                if (!button) return;

                chooseCenter(button.dataset.coolingId);
            });

        root.querySelector("#coolxTableBody")
            .addEventListener("click", event => {
                const button = event.target.closest(
                    "[data-cooling-id]"
                );

                if (!button) return;

                chooseCenter(button.dataset.coolingId);
            });

        return root;
    }

    // ======================================================
    // 5. TOP KPI CARDS
    // ======================================================

    function renderKPIs() {
        const degraded = sum("coolingDegraded");
        const failures = sum("coolingFailures");
        const readings = sum("readings");

        page.querySelector("#coolxTotalDegraded")
            .textContent = fmt(degraded);

        page.querySelector("#coolxTotalFailures")
            .textContent = fmt(failures);

        page.querySelector("#coolxDegradedRate")
            .textContent =
                rate(degraded, readings).toFixed(2) + "%";

        page.querySelector("#coolxCenterCount")
            .textContent = getCenters().length;

        page.querySelector("#coolxDate")
            .textContent =
                "Gold Date: " +
                (typeof processDate !== "undefined"
                    ? processDate
                    : "—");
    }

    // ======================================================
    // 6. SELECTABLE DATA CENTER CARDS
    // ======================================================

    function renderCards() {
        const grid = page.querySelector("#coolxCards");

        grid.replaceChildren();

        getCenters().forEach(center => {
            const button = element(
                "button",
                "coolx-center"
            );

            button.type = "button";
            button.dataset.coolingId = center.id;

            const isSelected = center.id === selectedId;

            if (isSelected) {
                button.classList.add("selected");
            }

            button.setAttribute(
                "aria-pressed",
                String(isSelected)
            );

            const header = element(
                "div",
                "coolx-center-top"
            );

            header.appendChild(
                element("strong", "", center.id)
            );

            header.appendChild(
                element("i", "fa-solid fa-snowflake")
            );

            button.appendChild(header);

            button.appendChild(
                element(
                    "span",
                    "coolx-center-city",
                    center.city
                )
            );

            button.appendChild(
                element(
                    "span",
                    "coolx-center-value",
                    rate(
                        center.coolingDegraded,
                        center.readings
                    ).toFixed(2) + "%"
                )
            );

            button.appendChild(
                element(
                    "span",
                    "coolx-center-caption",
                    "Daily degradation rate"
                )
            );

            grid.appendChild(button);
        });
    }

    // ======================================================
    // 7. SELECTED COOLING SYSTEM DETAILS
    // ======================================================

    function renderDetails() {
        const target = page.querySelector("#coolxDetails");

        target.replaceChildren();

        const center = selectedCenter();

        if (!center) return;

        const ranking = rankedCenters();

        const rank = ranking.findIndex(
            item => item.id === center.id
        ) + 1;

        const heading = element(
            "div",
            "coolx-details-heading"
        );

        const title = element("div");

        title.appendChild(
            element(
                "h3",
                "",
                `${center.id} — ${center.city}`
            )
        );

        title.appendChild(
            element(
                "p",
                "",
                `${center.region} Region · ${center.date}`
            )
        );

        heading.appendChild(title);

        heading.appendChild(
            element(
                "span",
                "coolx-rank",
                `Degradation Rank #${rank} of ${ranking.length}`
            )
        );

        target.appendChild(heading);

        const grid = element(
            "div",
            "coolx-details-grid"
        );

        const metrics = [
            [
                "Cooling Degraded Readings",
                fmt(center.coolingDegraded)
            ],
            [
                "Cooling Failure Readings",
                fmt(center.coolingFailures)
            ],
            [
                "Cooling Degradation Rate",
                rate(
                    center.coolingDegraded,
                    center.readings
                ).toFixed(2) + "%"
            ],
            [
                "Cooling Failure Rate",
                rate(
                    center.coolingFailures,
                    center.readings
                ).toFixed(2) + "%"
            ],
            [
                "Daily Sensor Readings",
                fmt(center.readings)
            ],
            [
                "Average Temperature",
                center.temperature.toFixed(2) + "°C"
            ],
            [
                "Maximum Temperature",
                center.maxTemperature.toFixed(2) + "°C"
            ],
            [
                "Critical Readings",
                fmt(center.critical)
            ]
        ];

        metrics.forEach(([label, value]) => {
            const card = element(
                "div",
                "coolx-detail-metric"
            );

            card.appendChild(
                element("span", "", label)
            );

            card.appendChild(
                element("strong", "", value)
            );

            grid.appendChild(card);
        });

        target.appendChild(grid);
    }

    // ======================================================
    // 8. COOLING COMPARISON TABLE
    // ======================================================

    function renderTable() {
        const tbody = page.querySelector(
            "#coolxTableBody"
        );

        tbody.replaceChildren();

        rankedCenters().forEach((center, index) => {
            const row = element("tr");

            if (center.id === selectedId) {
                row.classList.add(
                    "coolx-selected-row"
                );
            }

            const values = [
                "#" + (index + 1),
                center.id,
                center.city,
                fmt(center.coolingDegraded),
                rate(
                    center.coolingDegraded,
                    center.readings
                ).toFixed(2) + "%",
                fmt(center.coolingFailures),
                rate(
                    center.coolingFailures,
                    center.readings
                ).toFixed(2) + "%"
            ];

            values.forEach((value, cellIndex) => {
                const cell = element("td");

                if (cellIndex === 1) {
                    const button = element(
                        "button",
                        "coolx-table-button",
                        value
                    );

                    button.type = "button";
                    button.dataset.coolingId = center.id;

                    cell.appendChild(button);
                } else {
                    cell.textContent = value;
                }

                row.appendChild(cell);
            });

            tbody.appendChild(row);
        });
    }

    // ======================================================
    // 9. DATA QUALITY INSIGHT
    // ======================================================

    function renderDataInsight() {
        const target = page.querySelector(
            "#coolxDataInsight"
        );

        const centers = getCenters();

        const allMatching = centers.length > 0 &&
            centers.every(
                center =>
                    center.coolingFailures === center.critical
            );

        if (allMatching) {
            target.textContent =
                "DATA QUALITY CHECK — The cooling failure " +
                "reading count exactly matches the critical " +
                "reading count for every data center in this " +
                "daily snapshot. This may be intentional, " +
                "but the Gold transformation should be " +
                "reviewed to confirm that cooling failures " +
                "are calculated independently.";
        } else {
            target.textContent =
                "DATA QUALITY INSIGHT — Cooling indicators " +
                "are ranked using daily reading rates. " +
                "Compare centers using percentages as well " +
                "as counts because reading volumes can vary.";
        }
    }

    // ======================================================
    // 10. CHART THEMING
    // ======================================================

    function chartTheme() {
        const root = getComputedStyle(
            document.documentElement
        );

        return {
            text:
                root.getPropertyValue(
                    "--text-secondary"
                ).trim() || "#57749f",

            grid:
                root.getPropertyValue(
                    "--grid-color"
                ).trim() || "rgba(58,115,191,.12)"
        };
    }

    function chartScales() {
        const theme = chartTheme();

        return {
            x: {
                grid: { display: false },
                ticks: {
                    color: theme.text,
                    font: { size: 9 }
                }
            },

            y: {
                beginAtZero: true,
                grid: {
                    color: theme.grid
                },
                ticks: {
                    color: theme.text,
                    font: { size: 9 }
                }
            }
        };
    }

    // ======================================================
    // 11. CREATE REAL COOLING CHARTS
    // ======================================================

    function createCoolingCharts() {
        if (
            typeof Chart === "undefined" ||
            !page ||
            !container.contains(page)
        ) {
            return;
        }

        destroyCoolingCharts();

        const ranked = rankedCenters();

        const rateChart = new Chart(
            page.querySelector("#coolxRateChart"),
            {
                type: "bar",

                data: {
                    labels: ranked.map(c => c.id),

                    datasets: [{
                        label: "Degradation Rate (%)",

                        data: ranked.map(c =>
                            Number(
                                rate(
                                    c.coolingDegraded,
                                    c.readings
                                ).toFixed(3)
                            )
                        ),

                        backgroundColor: ranked.map(c =>
                            c.id === selectedId
                                ? "#efb13d"
                                : "#10b5bf"
                        ),

                        borderRadius: 5,
                        maxBarThickness: 28
                    }]
                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false,

                    plugins: {
                        legend: {
                            display: false
                        },

                        tooltip: {
                            callbacks: {
                                label(context) {
                                    return (
                                        context.parsed.y.toFixed(3)
                                        + "%"
                                    );
                                }
                            }
                        }
                    },

                    scales: chartScales()
                }
            }
        );

        const countChart = new Chart(
            page.querySelector("#coolxCountChart"),
            {
                type: "bar",

                data: {
                    labels: ranked.map(c => c.id),

                    datasets: [
                        {
                            label: "Degraded Readings",

                            data: ranked.map(
                                c => c.coolingDegraded
                            ),

                            backgroundColor: ranked.map(c =>
                                c.id === selectedId
                                    ? "#efb13d"
                                    : "#2685fa"
                            ),

                            borderRadius: 3
                        },
                        {
                            label: "Failure Readings",

                            data: ranked.map(
                                c => c.coolingFailures
                            ),

                            backgroundColor: ranked.map(c =>
                                c.id === selectedId
                                    ? "#ff8b46"
                                    : "#ed6674"
                            ),

                            borderRadius: 3
                        }
                    ]
                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false,

                    plugins: {
                        legend: {
                            labels: {
                                color: chartTheme().text,
                                boxWidth: 11,
                                font: { size: 10 }
                            }
                        }
                    },

                    scales: chartScales()
                }
            }
        );

        charts.push(rateChart, countChart);
    }

    // ======================================================
    // 12. SELECT CENTER AND UPDATE EVERYTHING
    // ======================================================

    function chooseCenter(id) {
        selectedId = id;

        renderCards();
        renderDetails();
        renderTable();

        const ranked = rankedCenters();

        if (charts.length !== 2) return;

        charts[0].data.datasets[0].backgroundColor =
            ranked.map(c =>
                c.id === selectedId
                    ? "#efb13d"
                    : "#10b5bf"
            );

        charts[1].data.datasets[0].backgroundColor =
            ranked.map(c =>
                c.id === selectedId
                    ? "#efb13d"
                    : "#2685fa"
            );

        charts[1].data.datasets[1].backgroundColor =
            ranked.map(c =>
                c.id === selectedId
                    ? "#ff8b46"
                    : "#ed6674"
            );

        charts.forEach(chart => chart.update());
    }

    // ======================================================
    // 13. SHOW COOLING PAGE
    // ======================================================

    function showCoolingPage() {
        destroyCoolingCharts();

        container.classList.add("coolx-active");

        page = buildPage();

        container.replaceChildren(page);

        const centers = getCenters();

        if (!centers.length) {
            page.querySelector("#coolxCards")
                .textContent =
                    "Waiting for Databricks Gold data. " +
                    "Click Refresh Cooling Data.";

            return;
        }

        if (
            !selectedId ||
            !centers.some(c => c.id === selectedId)
        ) {
            selectedId = centers[0].id;
        }

        renderKPIs();
        renderCards();
        renderDetails();
        renderTable();
        renderDataInsight();

        requestAnimationFrame(() => {
            if (
                currentPage === "cooling" &&
                container.contains(page)
            ) {
                createCoolingCharts();
            }
        });
    }

    // ======================================================
    // 14. REFRESH FROM FASTAPI
    // ======================================================

    async function refreshCooling() {
        if (refreshing) return;

        refreshing = true;

        const button = page?.querySelector(
            "#coolxRefresh"
        );

        if (button) {
            button.disabled = true;
            button.textContent = "Refreshing...";
        }

        try {
            // Reuse existing app's real Databricks API loader.
            await loadDashboardData(true);

            if (currentPage === "cooling") {
                showCoolingPage();
            }

        } catch (error) {
            console.error(
                "Cooling refresh failed:",
                error
            );

        } finally {
            refreshing = false;

            if (button && button.isConnected) {
                button.disabled = false;
                button.textContent =
                    "↻ Refresh Cooling Data";
            }
        }
    }

    // ======================================================
    // 15. CONNECT TO EXISTING SIDEBAR NAVIGATION
    // ======================================================

    document.addEventListener("click", event => {
        const nav = event.target.closest(".nav-item");

        if (nav) {
            if (nav.dataset.page === "cooling") {
                showCoolingPage();
            } else {
                destroyCoolingCharts();

                container.classList.remove(
                    "coolx-active"
                );
            }

            return;
        }

        // Existing app routes these to Alerts.
        if (
            event.target.closest("#notificationButton") ||
            event.target.closest("#viewAllAlerts")
        ) {
            destroyCoolingCharts();

            container.classList.remove(
                "coolx-active"
            );
        }

        // Rebuild chart colors after theme switches.
        if (
            event.target.closest("#lightModeButton") ||
            event.target.closest("#darkModeButton")
        ) {
            if (
                currentPage === "cooling" &&
                page &&
                container.contains(page)
            ) {
                requestAnimationFrame(
                    createCoolingCharts
                );
            }
        }
    });

})();


/* ==========================================================
   REPORTS & ANALYTICS MODULE
   Databricks Gold Daily Reporting

   ADD AT THE END OF frontend/script.js

   Features:
   - Region and Data Center filters
   - Risk-based sorting
   - Actual Databricks comparison charts
   - Detailed analytics table
   - Download filtered CSV

   No mock data, no fake hourly metrics.
========================================================== */

(() => {
    "use strict";

    const API_URL =
       dashboardApi("overview");
    let host = null;
    let page = null;
    let records = [];
    let reportDate = null;
    let charts = [];
    let requestId = 0;

    const num = value =>
        Number(value || 0);

    const fmt = value =>
        num(value).toLocaleString("en-IN");

    const pct = (part, total) =>
        total > 0 ? part / total * 100 : 0;

    function make(tag, className = "", text = null) {
        const item = document.createElement(tag);

        if (className) item.className = className;

        if (text !== null) {
            item.textContent = String(text);
        }

        return item;
    }

    function getTheme() {
        const style = getComputedStyle(
            document.documentElement
        );

        return {
            blue:
                style.getPropertyValue(
                    "--primary-blue"
                ).trim() || "#267fff",

            text:
                style.getPropertyValue(
                    "--text-secondary"
                ).trim() || "#7185a6",

            grid:
                style.getPropertyValue(
                    "--grid-color"
                ).trim() || "rgba(60,110,190,.12)"
        };
    }

    function isActive() {
        return (
            page !== null &&
            host.contains(page) &&
            typeof currentPage !== "undefined" &&
            currentPage === "reports"
        );
    }

    // ======================================================
    // 1. STYLES
    // ======================================================

    function installStyles() {
        if (document.getElementById("rptStyles")) {
            return;
        }

        const style = document.createElement("style");

        style.id = "rptStyles";

        style.textContent = `
            .secondary-page-content.rpt-active {
                display: block;
                text-align: left;
                padding: 22px;
                min-height: 400px;
                align-items: initial;
                justify-content: initial;
            }

            .rpt-page {
                width: 100%;
                color: var(--text-primary);
            }

            .rpt-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 14px;
                margin-bottom: 20px;
            }

            .rpt-description {
                max-width: 680px;
                font-size: 11px;
                line-height: 1.8;
                color: var(--text-secondary);
            }

            .rpt-export,
            .rpt-refresh {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                border: 0;
                border-radius: 9px;
                padding: 11px 15px;
                font-size: 11px;
                font-weight: 800;
                cursor: pointer;
            }

            .rpt-export {
                color: white;
                background: linear-gradient(
                    135deg, #0b70ed, #348dff
                );
                box-shadow: 0 8px 20px rgba(19,112,239,.16);
            }

            .rpt-refresh {
                background: var(--card-subtle);
                color: var(--text-primary);
                border: 1px solid var(--border-color);
            }

            .rpt-export:hover,
            .rpt-refresh:hover {
                transform: translateY(-1px);
            }

            .rpt-export:disabled,
            .rpt-refresh:disabled {
                opacity: .55;
                cursor: wait;
            }

            .rpt-actions {
                display: flex;
                gap: 9px;
                flex-wrap: wrap;
            }

            .rpt-kpis {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 12px;
                margin-bottom: 23px;
            }

            .rpt-kpi {
                min-width: 0;
                position: relative;
                overflow: hidden;
                padding: 19px 16px;
                border-radius: 13px;
                border: 1px solid var(--border-color);
                background: var(--card-bg);
                box-shadow: 0 7px 20px rgba(32,80,150,.045);
            }

            .rpt-kpi::before {
                content: "";
                position: absolute;
                top: 0;
                bottom: 0;
                left: 0;
                width: 4px;
                background: #2786ff;
            }

            .rpt-kpi:nth-child(1) {
                background:
                    linear-gradient(
                        125deg,
                        rgba(39,134,255,.08),
                        transparent
                    ),
                    var(--card-bg);
            }

            .rpt-kpi:nth-child(2) {
                background:
                    linear-gradient(
                        125deg,
                        rgba(136,99,245,.09),
                        transparent
                    ),
                    var(--card-bg);
            }

            .rpt-kpi:nth-child(2)::before {
                background: #9864ff;
            }

            .rpt-kpi:nth-child(3) {
                background:
                    linear-gradient(
                        125deg,
                        rgba(10,184,190,.09),
                        transparent
                    ),
                    var(--card-bg);
            }

            .rpt-kpi:nth-child(3)::before {
                background: #12b8c0;
            }

            .rpt-kpi:nth-child(4) {
                background:
                    linear-gradient(
                        125deg,
                        rgba(244,181,68,.10),
                        transparent
                    ),
                    var(--card-bg);
            }

            .rpt-kpi:nth-child(4)::before {
                background: #f4b544;
            }

            .rpt-kpi span {
                display: block;
                color: var(--text-secondary);
                font-size: 10px;
            }

            .rpt-kpi strong {
                display: block;
                margin-top: 10px;
                color: var(--text-primary);
                font-size: clamp(19px, 2.2vw, 27px);
                font-weight: 800;
                overflow-wrap: anywhere;
            }

            .rpt-kpi small {
                display: block;
                margin-top: 7px;
                color: var(--text-secondary);
                font-size: 9px;
            }

            .rpt-filter-panel {
                border: 1px solid var(--border-color);
                border-radius: 13px;
                background: var(--card-bg);
                padding: 17px;
                margin-bottom: 23px;
            }

            .rpt-filter-heading {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 15px;
                gap: 10px;
            }

            .rpt-filter-heading strong {
                font-size: 13px;
            }

            .rpt-filter-heading span {
                font-size: 10px;
                color: var(--text-secondary);
            }

            .rpt-filter-grid {
                display: grid;
                grid-template-columns:
                    repeat(3, minmax(0, 1fr));
                gap: 13px;
            }

            .rpt-field label {
                display: block;
                font-size: 10px;
                color: var(--text-secondary);
                margin-bottom: 8px;
                font-weight: 700;
            }

            .rpt-field select {
                width: 100%;
                padding: 11px 12px;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background: var(--card-subtle);
                color: var(--text-primary);
                font-size: 11px;
                outline: none;
                cursor: pointer;
            }

            .rpt-field select:focus-visible {
                border-color: var(--primary-blue);
                outline: 2px solid rgba(39,134,255,.15);
            }

            .rpt-title {
                margin: 23px 0 14px;
                color: var(--text-primary);
                font-size: 16px;
                font-weight: 800;
            }

            .rpt-chart-grid {
                display: grid;
                grid-template-columns:
                    repeat(2, minmax(0, 1fr));
                gap: 13px;
                margin-bottom: 24px;
            }

            .rpt-chart-card {
                min-width: 0;
                padding: 18px;
                border-radius: 12px;
                border: 1px solid var(--border-color);
                background: var(--card-bg);
            }

            .rpt-chart-card:first-child {
                border-top: 3px solid #efb544;
            }

            .rpt-chart-card:last-child {
                border-top: 3px solid #2786ff;
            }

            .rpt-chart-card h4 {
                font-size: 12px;
                font-weight: 800;
            }

            .rpt-chart-card p {
                font-size: 10px;
                line-height: 1.6;
                color: var(--text-secondary);
                margin-top: 6px;
            }

            .rpt-chart-wrap {
                height: 245px;
                position: relative;
                margin-top: 15px;
            }

            .rpt-chart-wrap canvas {
                display: block;
                max-width: 100%;
            }

            .rpt-table-wrap {
                border: 1px solid var(--border-color);
                border-radius: 11px;
                overflow-x: auto;
                background: var(--card-bg);
            }

            .rpt-table {
                width: 100%;
                border-collapse: collapse;
            }

            .rpt-table th {
                text-align: left;
                font-size: 10px;
                color: var(--text-secondary);
                background: var(--card-subtle);
                padding: 13px;
                white-space: nowrap;
            }

            .rpt-table td {
                color: var(--text-primary);
                font-size: 11px;
                padding: 14px 13px;
                white-space: nowrap;
                border-bottom: 1px solid var(--border-color);
            }

            .rpt-table tr:last-child td {
                border-bottom: 0;
            }

            .rpt-table tbody tr:hover {
                background: var(--card-hover);
            }

            .rpt-center-name {
                font-weight: 800;
                color: var(--primary-blue);
            }

            .rpt-critical {
                color: #e76b69;
                font-weight: 800;
            }

            .rpt-cooling {
                color: #0aacbd;
                font-weight: 800;
            }

            .rpt-footer {
                margin-top: 17px;
                padding: 14px 16px;
                font-size: 10px;
                line-height: 1.8;
                color: var(--text-secondary);
                border-left: 3px solid var(--primary-blue);
                background: var(--card-subtle);
                border-radius: 8px;
            }

            .rpt-status {
                color: var(--text-secondary);
                font-size: 11px;
                margin-top: 11px;
            }

            .rpt-error {
                color: #ed6570;
            }

            @media (max-width: 1100px) {
                .rpt-kpis {
                    grid-template-columns:
                        repeat(2, minmax(0, 1fr));
                }
            }

            @media (max-width: 780px) {
                .rpt-chart-grid,
                .rpt-filter-grid {
                    grid-template-columns: 1fr;
                }

                .secondary-page-content.rpt-active {
                    padding: 13px;
                }
            }

            @media (max-width: 430px) {
                .rpt-kpis {
                    grid-template-columns: 1fr;
                }
            }
        `;

        document.head.appendChild(style);
    }

    // ======================================================
    // 2. BUILD PAGE
    // ======================================================

    function buildPage() {
        const root = make("div", "rpt-page");

        root.innerHTML = `
            <div class="rpt-header">
                <p class="rpt-description">
                    Analyze your latest Databricks Gold data,
                    compare infrastructure performance and
                    export filtered daily reports.
                </p>

                <div class="rpt-actions">
                    <button
                        id="rptRefresh"
                        class="rpt-refresh"
                        type="button">
                        <i class="fa-solid fa-rotate"></i>
                        Refresh
                    </button>

                    <button
                        id="rptExport"
                        class="rpt-export"
                        type="button"
                        disabled>
                        <i class="fa-solid fa-file-csv"></i>
                        Download CSV
                    </button>
                </div>
            </div>

            <div class="rpt-kpis">
                <article class="rpt-kpi">
                    <span>Data Centers</span>
                    <strong id="rptTotalCenters">—</strong>
                    <small>Matching current filters</small>
                </article>

                <article class="rpt-kpi">
                    <span>Total Daily Readings</span>
                    <strong id="rptTotalReadings">—</strong>
                    <small>Across filtered centers</small>
                </article>

                <article class="rpt-kpi">
                    <span>Weighted Avg Temperature</span>
                    <strong id="rptAverageTemp">—</strong>
                    <small>Weighted by daily readings</small>
                </article>

                <article class="rpt-kpi">
                    <span>Critical Reading Rate</span>
                    <strong id="rptCriticalRate">—</strong>
                    <small>Critical / total readings</small>
                </article>
            </div>

            <div class="rpt-filter-panel">
                <div class="rpt-filter-heading">
                    <strong>
                        <i class="fa-solid fa-filter"></i>
                        Report Filters
                    </strong>

                    <span id="rptDate">
                        Loading Gold date...
                    </span>
                </div>

                <div class="rpt-filter-grid">
                    <div class="rpt-field">
                        <label for="rptRegion">
                            Region
                        </label>

                        <select id="rptRegion">
                            <option value="all">
                                All Regions
                            </option>
                        </select>
                    </div>

                    <div class="rpt-field">
                        <label for="rptCenter">
                            Data Center
                        </label>

                        <select id="rptCenter">
                            <option value="all">
                                All Data Centers
                            </option>
                        </select>
                    </div>

                    <div class="rpt-field">
                        <label for="rptSort">
                            Sort By
                        </label>

                        <select id="rptSort">
                            <option value="critical">
                                Highest Critical Rate
                            </option>

                            <option value="cooling">
                                Highest Cooling Degradation
                            </option>

                            <option value="power">
                                Highest Average Power
                            </option>

                            <option value="temperature">
                                Highest Avg Temperature
                            </option>

                            <option value="id">
                                Data Center ID
                            </option>
                        </select>
                    </div>
                </div>
            </div>

            <h3 class="rpt-title">
                Infrastructure Comparison
            </h3>

            <div class="rpt-chart-grid">
                <article class="rpt-chart-card">
                    <h4>Critical Reading Rate</h4>
                    <p>
                        Daily critical readings as a
                        percentage of all sensor readings.
                    </p>

                    <div class="rpt-chart-wrap">
                        <canvas id="rptCriticalChart"></canvas>
                    </div>
                </article>

                <article class="rpt-chart-card">
                    <h4>Average Power Comparison</h4>
                    <p>
                        Daily average power per data center · kW
                    </p>

                    <div class="rpt-chart-wrap">
                        <canvas id="rptPowerChart"></canvas>
                    </div>
                </article>
            </div>

            <h3 class="rpt-title">
                Detailed Gold Report
            </h3>

            <div class="rpt-table-wrap">
                <table class="rpt-table">
                    <thead>
                        <tr>
                            <th>Data Center</th>
                            <th>City</th>
                            <th>Region</th>
                            <th>Readings</th>
                            <th>Avg Temp</th>
                            <th>Max Temp</th>
                            <th>Avg Power</th>
                            <th>Critical Rate</th>
                            <th>Warning Rate</th>
                            <th>Cooling Degraded</th>
                            <th>Degradation Rate</th>
                            <th>Offline Rate</th>
                        </tr>
                    </thead>

                    <tbody id="rptTableBody"></tbody>
                </table>
            </div>

            <p
                id="rptStatus"
                class="rpt-status"
                role="status"
            >
                Loading actual Databricks Gold data...
            </p>

            <div class="rpt-footer">
                <strong>Report information:</strong>
                CSV exports contain the latest daily Gold
                snapshot and respect the selected filters
                and sorting.

                Power is reported in kW, not kWh.
                Reading categories may overlap.
                Historical critical and cooling readings
                are not unique live incidents.
            </div>
        `;

        root.querySelector("#rptRefresh")
            .addEventListener("click", fetchReports);

        root.querySelector("#rptExport")
            .addEventListener("click", exportCSV);

        [
            "#rptRegion",
            "#rptCenter",
            "#rptSort"
        ].forEach(selector => {
            root.querySelector(selector)
                .addEventListener(
                    "change",
                    renderFilteredReport
                );
        });

        return root;
    }

    // ======================================================
    // 3. NORMALIZE API DATA
    // ======================================================

    function normalize(record) {
        const rawId = String(
            record.data_center_id || ""
        );

        const match = rawId.match(/^DC-?(\d+)$/i);

        const id = match
            ? `DC-${match[1].padStart(2, "0")}`
            : rawId;

        return {
            id,
            city: record.city || "Unknown",
            region: record.region || "Unknown",
            processDate: record.process_date || reportDate,

            readings: num(record.total_readings),
            avgTemp: num(record.average_temperature),
            maxTemp: num(record.maximum_temperature),
            humidity: num(record.average_humidity),
            power: num(record.average_power_kw),

            critical: num(record.critical_readings),
            warning: num(record.warning_readings),

            coolingFailures: num(
                record.cooling_failures
            ),

            coolingDegraded: num(
                record.cooling_degraded_readings
            ),

            offline: num(
                record.offline_sensor_readings
            )
        };
    }

    // ======================================================
    // 4. POPULATE FILTERS
    // ======================================================

    function populateFilters() {
        const regionSelect = page.querySelector(
            "#rptRegion"
        );

        const centerSelect = page.querySelector(
            "#rptCenter"
        );

        const previousRegion = regionSelect.value;
        const previousCenter = centerSelect.value;

        regionSelect.replaceChildren();
        centerSelect.replaceChildren();

        regionSelect.add(
            new Option("All Regions", "all")
        );

        centerSelect.add(
            new Option("All Data Centers", "all")
        );

        const regions = [
            ...new Set(
                records.map(item => item.region)
            )
        ].sort();

        regions.forEach(region => {
            regionSelect.add(
                new Option(region, region)
            );
        });

        records.forEach(center => {
            centerSelect.add(
                new Option(
                    `${center.id} — ${center.city}`,
                    center.id
                )
            );
        });

        if (
            [...regionSelect.options].some(
                option => option.value === previousRegion
            )
        ) {
            regionSelect.value = previousRegion;
        }

        if (
            [...centerSelect.options].some(
                option => option.value === previousCenter
            )
        ) {
            centerSelect.value = previousCenter;
        }
    }

    // ======================================================
    // 5. FILTER AND SORT
    // ======================================================

    function filteredRecords() {
        if (!page) return [];

        const region = page.querySelector(
            "#rptRegion"
        ).value;

        const centerId = page.querySelector(
            "#rptCenter"
        ).value;

        const sort = page.querySelector(
            "#rptSort"
        ).value;

        const selected = records.filter(center => {
            const regionMatches =
                region === "all" ||
                center.region === region;

            const centerMatches =
                centerId === "all" ||
                center.id === centerId;

            return regionMatches && centerMatches;
        });

        selected.sort((a, b) => {
            switch (sort) {
                case "critical":
                    return (
                        pct(b.critical, b.readings) -
                        pct(a.critical, a.readings)
                    );

                case "cooling":
                    return (
                        pct(
                            b.coolingDegraded,
                            b.readings
                        ) -
                        pct(
                            a.coolingDegraded,
                            a.readings
                        )
                    );

                case "power":
                    return b.power - a.power;

                case "temperature":
                    return b.avgTemp - a.avgTemp;

                default:
                    return a.id.localeCompare(b.id);
            }
        });

        return selected;
    }

    // ======================================================
    // 6. UPDATE KPI CARDS
    // ======================================================

    function renderKPIs(rows) {
        const readings = rows.reduce(
            (total, c) => total + c.readings,
            0
        );

        const critical = rows.reduce(
            (total, c) => total + c.critical,
            0
        );

        // Reading-weighted temperature average
        const weightedTemp = readings > 0
            ? rows.reduce(
                (total, c) =>
                    total + c.avgTemp * c.readings,
                0
            ) / readings
            : 0;

        page.querySelector("#rptTotalCenters")
            .textContent = rows.length;

        page.querySelector("#rptTotalReadings")
            .textContent = fmt(readings);

        page.querySelector("#rptAverageTemp")
            .textContent =
                weightedTemp.toFixed(2) + "°C";

        page.querySelector("#rptCriticalRate")
            .textContent =
                pct(critical, readings).toFixed(2) + "%";
    }

    // ======================================================
    // 7. RENDER TABLE
    // ======================================================

    function renderTable(rows) {
        const tbody = page.querySelector(
            "#rptTableBody"
        );

        tbody.replaceChildren();

        if (!rows.length) {
            const row = make("tr");

            const cell = make(
                "td",
                "",
                "No data centers match the filters."
            );

            cell.colSpan = 12;

            row.appendChild(cell);
            tbody.appendChild(row);

            return;
        }

        rows.forEach(center => {
            const row = make("tr");

            const values = [
                center.id,
                center.city,
                center.region,
                fmt(center.readings),
                center.avgTemp.toFixed(2) + "°C",
                center.maxTemp.toFixed(2) + "°C",
                center.power.toFixed(2) + " kW",
                pct(
                    center.critical,
                    center.readings
                ).toFixed(2) + "%",
                pct(
                    center.warning,
                    center.readings
                ).toFixed(2) + "%",
                fmt(center.coolingDegraded),
                pct(
                    center.coolingDegraded,
                    center.readings
                ).toFixed(2) + "%",
                pct(
                    center.offline,
                    center.readings
                ).toFixed(2) + "%"
            ];

            values.forEach((value, index) => {
                const cell = make("td", "", value);

                if (index === 0) {
                    cell.className = "rpt-center-name";
                }

                if (index === 7) {
                    cell.className = "rpt-critical";
                }

                if (index === 10) {
                    cell.className = "rpt-cooling";
                }

                row.appendChild(cell);
            });

            tbody.appendChild(row);
        });
    }

    // ======================================================
    // 8. CHART CLEANUP AND SCALES
    // ======================================================

    function destroyCharts() {
        charts.forEach(chart => chart.destroy());
        charts = [];
    }

    function chartScales() {
        const theme = getTheme();

        return {
            x: {
                grid: {
                    display: false
                },
                ticks: {
                    color: theme.text,
                    font: { size: 9 }
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: theme.grid
                },
                ticks: {
                    color: theme.text,
                    font: { size: 9 }
                }
            }
        };
    }

    // ======================================================
    // 9. REAL DATA CHARTS
    // ======================================================

    function renderCharts(rows) {
        destroyCharts();

        if (
            !isActive() ||
            !rows.length ||
            typeof Chart === "undefined"
        ) {
            return;
        }

        const theme = getTheme();

        const labels = rows.map(c => c.id);

        const criticalCanvas = page.querySelector(
            "#rptCriticalChart"
        );

        const powerCanvas = page.querySelector(
            "#rptPowerChart"
        );

        const criticalChart = new Chart(
            criticalCanvas,
            {
                type: "bar",

                data: {
                    labels,

                    datasets: [{
                        label: "Critical Rate (%)",

                        data: rows.map(c =>
                            pct(
                                c.critical,
                                c.readings
                            )
                        ),

                        backgroundColor: rows.map(
                            (_, index) =>
                                index === 0
                                    ? "#f4b544"
                                    : "#2786ff"
                        ),

                        borderRadius: 5,
                        maxBarThickness: 30
                    }]
                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false,

                    plugins: {
                        legend: {
                            display: false
                        },

                        tooltip: {
                            callbacks: {
                                label(context) {
                                    return (
                                        context.parsed.y.toFixed(3)
                                        + "%"
                                    );
                                }
                            }
                        }
                    },

                    scales: chartScales()
                }
            }
        );

        const powerChart = new Chart(
            powerCanvas,
            {
                type: "bar",

                data: {
                    labels,

                    datasets: [{
                        label: "Daily Avg Power (kW)",

                        data: rows.map(c => c.power),

                        backgroundColor: rows.map(
                            (_, index) =>
                                index === 0
                                    ? "#f4b544"
                                    : "#12b8c0"
                        ),

                        borderRadius: 5,
                        maxBarThickness: 30
                    }]
                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false,

                    plugins: {
                        legend: {
                            display: false
                        }
                    },

                    scales: chartScales()
                }
            }
        );

        charts.push(criticalChart, powerChart);
    }

    // ======================================================
    // 10. RENDER FILTERED REPORT
    // ======================================================

    function renderFilteredReport() {
        if (!isActive()) return;

        const rows = filteredRecords();

        renderKPIs(rows);
        renderTable(rows);

        renderCharts(rows);

        page.querySelector("#rptExport")
            .disabled = rows.length === 0;

        page.querySelector("#rptStatus")
            .textContent =
                `${rows.length} of ${records.length} ` +
                `data centers shown · Gold date: ` +
                `${reportDate || "—"}`;
    }

    // ======================================================
    // 11. FETCH ACTUAL GOLD DATA
    // ======================================================

    async function fetchReports() {
        if (!isActive()) return;

        const thisRequest = ++requestId;
        const targetPage = page;

        const refresh = page.querySelector(
            "#rptRefresh"
        );

        const status = page.querySelector(
            "#rptStatus"
        );

        refresh.disabled = true;
        refresh.textContent = "Loading...";

        status.textContent =
            "Fetching latest Databricks Gold records...";

        try {
            const response = await fetch(
                API_URL,
                {
                    cache: "no-store"
                }
            );

            if (!response.ok) {
                throw new Error(
                    `API HTTP ${response.status}`
                );
            }

            const result = await response.json();

            if (
                result.source !== "databricks_gold" ||
                !Array.isArray(result.data_centers)
            ) {
                throw new Error(
                    "Invalid Gold API response."
                );
            }

            if (
                thisRequest !== requestId ||
                targetPage !== page ||
                !isActive()
            ) {
                return;
            }

            reportDate = result.process_date || null;

            records = result.data_centers.map(
                normalize
            );

            populateFilters();

            page.querySelector("#rptDate")
                .textContent =
                    `Gold Process Date: ${reportDate || "—"}`;

            renderFilteredReport();

        } catch (error) {
            console.error(
                "Reports API error:",
                error
            );

            if (
                thisRequest === requestId &&
                targetPage === page &&
                isActive()
            ) {
                status.textContent =
                    "Unable to fetch Databricks data. " +
                    "Check FastAPI on port 8000.";

                status.classList.add("rpt-error");
            }

        } finally {
            if (
                thisRequest === requestId &&
                targetPage === page &&
                isActive()
            ) {
                refresh.disabled = false;
                refresh.textContent = "↻ Refresh";
            }
        }
    }

    // ======================================================
    // 12. CSV EXPORT
    // ======================================================

    function escapeCSV(value) {
        let text = String(value ?? "");

        // Protect spreadsheet applications from
        // interpreting untrusted text as formulas.
        if (/^[\s]*[=+\-@]/.test(text)) {
            text = "'" + text;
        }

        return '"' +
            text.replaceAll('"', '""') +
            '"';
    }

    function exportCSV() {
        if (!isActive()) return;

        const rows = filteredRecords();

        if (!rows.length) return;

        const headers = [
            "process_date",
            "data_center_id",
            "city",
            "region",
            "total_readings",
            "average_temperature_c",
            "maximum_temperature_c",
            "average_humidity_pct",
            "average_power_kw",
            "critical_readings",
            "critical_rate_pct",
            "warning_readings",
            "warning_rate_pct",
            "cooling_failures",
            "cooling_failure_rate_pct",
            "cooling_degraded_readings",
            "cooling_degraded_rate_pct",
            "offline_sensor_readings",
            "offline_rate_pct"
        ];

        const csvRows = [headers];

        rows.forEach(center => {
            csvRows.push([
                center.processDate || reportDate,
                center.id,
                center.city,
                center.region,
                center.readings,
                center.avgTemp,
                center.maxTemp,
                center.humidity,
                center.power,
                center.critical,
                pct(
                    center.critical,
                    center.readings
                ).toFixed(4),
                center.warning,
                pct(
                    center.warning,
                    center.readings
                ).toFixed(4),
                center.coolingFailures,
                pct(
                    center.coolingFailures,
                    center.readings
                ).toFixed(4),
                center.coolingDegraded,
                pct(
                    center.coolingDegraded,
                    center.readings
                ).toFixed(4),
                center.offline,
                pct(
                    center.offline,
                    center.readings
                ).toFixed(4)
            ]);
        });

        const csv = csvRows.map(
            row => row.map(escapeCSV).join(",")
        ).join("\r\n");

        const blob = new Blob(
            ["\uFEFF", csv],
            {
                type: "text/csv;charset=utf-8;"
            }
        );

        const url = URL.createObjectURL(blob);

        const anchor = document.createElement("a");

        const safeDate = String(
            reportDate || "latest"
        ).replace(/[^a-zA-Z0-9-]/g, "");

        anchor.href = url;
        anchor.download =
            `data_center_gold_report_${safeDate}.csv`;

        document.body.appendChild(anchor);

        anchor.click();
        anchor.remove();

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);

        page.querySelector("#rptStatus")
            .textContent =
                `CSV prepared for download: ` +
                `${rows.length} data centers · ${safeDate}`;
    }

    // ======================================================
    // 13. SHOW AND CLOSE PAGE
    // ======================================================

    function showReportsPage() {
        requestId++;

        destroyCharts();

        host.classList.add("rpt-active");

        page = buildPage();

        host.replaceChildren(page);

        const title = document.getElementById(
            "secondaryPageTitle"
        );

        if (title) {
            title.textContent = "Reports & Analytics";
        }

        const description = document.getElementById(
            "secondaryPageDescription"
        );

        if (description) {
            description.textContent =
                "Databricks Gold · Daily reporting";
        }

        fetchReports();
    }

    function closeReportsPage() {
        requestId++;

        destroyCharts();

        host.classList.remove("rpt-active");

        page = null;
    }

    // ======================================================
    // 14. CONNECT SIDEBAR AND THEME
    // ======================================================

    function initializeReports() {
        host = document.querySelector(
            "#secondaryPage .secondary-page-content"
        );

        if (!host) return;

        installStyles();

        document.addEventListener("click", event => {
            const nav = event.target.closest(
                ".nav-item"
            );

            if (nav) {
                if (nav.dataset.page === "reports") {
                    showReportsPage();
                } else {
                    closeReportsPage();
                }

                return;
            }

            if (
                event.target.closest(
                    "#notificationButton"
                ) ||
                event.target.closest(
                    "#viewAllAlerts"
                ) ||
                event.target.closest(
                    "#backToOverview"
                )
            ) {
                closeReportsPage();
                return;
            }

            if (
                event.target.closest(
                    "#lightModeButton"
                ) ||
                event.target.closest(
                    "#darkModeButton"
                )
            ) {
                if (isActive()) {
                    requestAnimationFrame(() => {
                        renderCharts(
                            filteredRecords()
                        );
                    });
                }
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeReports
        );
    } else {
        initializeReports();
    }

})();



/* ==========================================================
   DAILY INTELLIGENCE INSIGHTS
   Source: FastAPI /api/intelligence/daily-comparison

   Add at the END of frontend/script.js

   Uses actual Databricks Gold data.
   No fake anomalies or simulated recommendations.
========================================================== */

(() => {
    "use strict";

    const API_URL =
       dashboardApi("comparison");

    let section = null;
    let loading = false;

    // ======================================================
    // 1. STYLING
    // ======================================================

    function addStyles() {
        if (document.getElementById("diStyles")) return;

        const style = document.createElement("style");

        style.id = "diStyles";

        style.textContent = `
            .di-section {
                width: 100%;
                margin: 24px 0;
                color: var(--text-primary);
            }

            .di-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 15px;
                flex-wrap: wrap;
                margin-bottom: 16px;
            }

            .di-header h2 {
                font-size: 17px;
                font-weight: 800;
                color: var(--text-primary);
            }

            .di-header p {
                margin-top: 6px;
                font-size: 11px;
                color: var(--text-secondary);
            }

            .di-refresh {
                padding: 10px 15px;
                border: none;
                border-radius: 9px;
                background: linear-gradient(
                    135deg, #0867ee, #428dff
                );
                color: #fff;
                font-size: 11px;
                font-weight: 800;
                cursor: pointer;
            }

            .di-refresh:disabled {
                opacity: .6;
                cursor: wait;
            }

            .di-summary {
                display: grid;
                grid-template-columns:
                    repeat(3, minmax(0, 1fr));
                gap: 13px;
                margin-bottom: 17px;
            }

            .di-card {
                min-width: 0;
                padding: 19px;
                background: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 12px;
                border-left: 4px solid #2786ff;
            }

            .di-card:nth-child(1) {
                background:
                    linear-gradient(
                        120deg,
                        rgba(39,134,255,.08),
                        transparent
                    ),
                    var(--card-bg);
            }

            .di-card:nth-child(2) {
                border-left-color: #f0ad3f;
                background:
                    linear-gradient(
                        120deg,
                        rgba(240,173,63,.09),
                        transparent
                    ),
                    var(--card-bg);
            }

            .di-card:nth-child(3) {
                border-left-color: #13b8bb;
                background:
                    linear-gradient(
                        120deg,
                        rgba(19,184,187,.09),
                        transparent
                    ),
                    var(--card-bg);
            }

            .di-card span {
                font-size: 10px;
                color: var(--text-secondary);
            }

            .di-card strong {
                display: block;
                margin-top: 11px;
                font-size: 23px;
                font-weight: 800;
                color: var(--text-primary);
            }

            .di-card small {
                display: block;
                margin-top: 8px;
                font-size: 10px;
                color: var(--text-secondary);
                line-height: 1.6;
            }

            .di-panel {
                padding: 19px;
                margin-bottom: 15px;
                border: 1px solid var(--border-color);
                border-radius: 12px;
                background: var(--card-bg);
            }

            .di-panel h3 {
                margin-bottom: 15px;
                font-size: 13px;
                font-weight: 800;
            }

            .di-insights {
                display: grid;
                grid-template-columns:
                    repeat(3, minmax(0, 1fr));
                gap: 12px;
            }

            .di-insight {
                min-width: 0;
                padding: 15px;
                border: 1px solid var(--border-color);
                border-radius: 10px;
                background: var(--card-subtle);
            }

            .di-insight:nth-child(1) {
                border-top: 3px solid #f0ad3f;
            }

            .di-insight:nth-child(2) {
                border-top: 3px solid #ed6d76;
            }

            .di-insight:nth-child(3) {
                border-top: 3px solid #13b8bb;
            }

            .di-insight strong {
                display: block;
                font-size: 12px;
                margin-bottom: 9px;
            }

            .di-insight p {
                color: var(--text-secondary);
                font-size: 11px;
                line-height: 1.7;
            }

            .di-table-wrap {
                overflow-x: auto;
            }

            .di-table {
                width: 100%;
                border-collapse: collapse;
            }

            .di-table th {
                padding: 13px;
                text-align: left;
                background: var(--card-subtle);
                color: var(--text-secondary);
                font-size: 10px;
                white-space: nowrap;
            }

            .di-table td {
                padding: 13px;
                border-bottom:
                    1px solid var(--border-color);
                color: var(--text-primary);
                font-size: 11px;
                white-space: nowrap;
            }

            .di-table tr:last-child td {
                border-bottom: none;
            }

            .di-center-name {
                font-weight: 800;
            }

            .di-city {
                display: block;
                margin-top: 5px;
                font-size: 10px;
                color: var(--text-secondary);
            }

            .di-change {
                display: inline-block;
                padding: 5px 8px;
                border-radius: 6px;
                font-weight: 800;
            }

            .di-change.up {
                color: #d9605e;
                background: rgba(239,98,105,.10);
            }

            .di-change.down {
                color: #0da588;
                background: rgba(13,165,136,.10);
            }

            .di-change.flat {
                color: var(--text-secondary);
                background: var(--card-subtle);
            }

            .di-footnote {
                padding: 12px 14px;
                border-left: 3px solid #2786ff;
                background: var(--card-subtle);
                border-radius: 8px;
                font-size: 10px;
                line-height: 1.8;
                color: var(--text-secondary);
            }

            .di-status {
                font-size: 11px;
                color: var(--text-secondary);
                margin-bottom: 12px;
            }

            @media (max-width: 900px) {
                .di-insights {
                    grid-template-columns: 1fr;
                }
            }

            @media (max-width: 650px) {
                .di-summary {
                    grid-template-columns: 1fr;
                }

                .di-section {
                    padding: 0 5px;
                }
            }
        `;

        document.head.appendChild(style);
    }

    // ======================================================
    // 2. CREATE OVERVIEW SECTION
    // ======================================================

    function createSection() {
        const overview = document.getElementById(
            "overview"
        );

        if (!overview) return;

        if (document.getElementById("diSection")) {
            section = document.getElementById(
                "diSection"
            );
            return;
        }

        section = document.createElement("section");
        section.id = "diSection";
        section.className = "di-section";

        section.innerHTML = `
            <div class="di-header">
                <div>
                    <h2>
                        <i class="fa-solid fa-brain"></i>
                        Daily Intelligence Insights
                    </h2>
                    <p id="diDate">
                        Loading historical comparison...
                    </p>
                </div>

                <button
                    id="diRefresh"
                    class="di-refresh"
                    type="button"
                >
                    ↻ Refresh Intelligence
                </button>
            </div>

            <div class="di-summary">
                <article class="di-card">
                    <span>Data Centers Compared</span>
                    <strong id="diTotal">—</strong>
                    <small>Consecutive daily Gold records</small>
                </article>

                <article class="di-card">
                    <span>Critical Rate Increased</span>
                    <strong id="diCriticalUp">—</strong>
                    <small>Centers with positive rate change</small>
                </article>

                <article class="di-card">
                    <span>Cooling Degradation Increased</span>
                    <strong id="diCoolingUp">—</strong>
                    <small>Centers with positive rate change</small>
                </article>
            </div>

            <div class="di-panel">
                <h3>
                    Investigation Insights
                </h3>

                <div
                    class="di-insights"
                    id="diInsights"
                ></div>
            </div>

            <div class="di-panel">
                <h3>
                    Day-over-Day Center Comparison
                </h3>

                <div class="di-table-wrap">
                    <table class="di-table">
                        <thead>
                            <tr>
                                <th>Data Center</th>
                                <th>Temperature Change</th>
                                <th>Critical Rate Change</th>
                                <th>Cooling Rate Change</th>
                            </tr>
                        </thead>

                        <tbody id="diTableBody"></tbody>
                    </table>
                </div>
            </div>

            <p id="diStatus" class="di-status"></p>

            <div class="di-footnote">
                Changes are calculated from consecutive
                Databricks Gold daily summaries.
                Rate differences are in percentage points (pp).
                These insights suggest review priorities,
                not confirmed anomalies or root causes.
            </div>
        `;

        // Put it before the Overview footer when possible.
        const footer = overview.querySelector(
            ".dashboard-footer"
        );

        if (footer && footer.parentElement === overview) {
            overview.insertBefore(section, footer);
        } else {
            overview.appendChild(section);
        }

        section.querySelector("#diRefresh")
            .addEventListener("click", loadIntelligence);
    }

    // ======================================================
    // 3. HELPERS
    // ======================================================

    function setValue(id, value) {
        const target = section?.querySelector("#" + id);

        if (target) {
            target.textContent = String(value);
        }
    }

    function formatChange(value, suffix) {
        const number = Number(value || 0);

        const sign = number > 0 ? "+" : "";

        return `${sign}${number.toFixed(
            suffix === "°C" ? 2 : 3
        )} ${suffix}`;
    }

    function createChangeCell(value, suffix) {
        const td = document.createElement("td");

        const number = Number(value || 0);

        const span = document.createElement("span");

        span.className = "di-change " + (
            number > 0
                ? "up"
                : number < 0
                    ? "down"
                    : "flat"
        );

        span.textContent = formatChange(
            number,
            suffix
        );

        td.appendChild(span);

        return td;
    }

    function addInsight(title, description) {
        const container = section.querySelector(
            "#diInsights"
        );

        const card = document.createElement("div");
        card.className = "di-insight";

        const heading = document.createElement("strong");
        heading.textContent = title;

        const paragraph = document.createElement("p");
        paragraph.textContent = description;

        card.append(heading, paragraph);
        container.appendChild(card);
    }

    // ======================================================
    // 4. GENERATE INSIGHTS FROM ACTUAL CHANGES
    // ======================================================

    function renderInsights(centers) {
        const target = section.querySelector(
            "#diInsights"
        );

        target.replaceChildren();

        const highestCooling = [...centers].sort(
            (a, b) =>
                b.cooling_rate_change_pp -
                a.cooling_rate_change_pp
        )[0];

        const highestCritical = [...centers].sort(
            (a, b) =>
                b.critical_rate_change_pp -
                a.critical_rate_change_pp
        )[0];

        const maxTempChange = Math.max(
            ...centers.map(c =>
                Math.abs(
                    Number(c.temperature_change_c || 0)
                )
            )
        );

        if (
            highestCooling &&
            highestCooling.cooling_rate_change_pp > 0
        ) {
            addInsight(
                "Cooling Review · " + highestCooling.city,

                `${highestCooling.data_center_id} had the ` +
                `largest increase in cooling degradation ` +
                `rate (${formatChange(
                    highestCooling.cooling_rate_change_pp,
                    "pp"
                )}). Review its cooling-related readings.`
            );
        } else {
            addInsight(
                "Cooling Trend",
                "No increase in cooling degradation rate " +
                "was reported among the compared centers."
            );
        }

        if (
            highestCritical &&
            highestCritical.critical_rate_change_pp > 0
        ) {
            addInsight(
                "Critical Reading Review · " +
                highestCritical.city,

                `${highestCritical.data_center_id} had the ` +
                `largest increase in critical-reading rate ` +
                `(${formatChange(
                    highestCritical.critical_rate_change_pp,
                    "pp"
                )}). Investigate its flagged readings.`
            );
        } else {
            addInsight(
                "Critical Reading Trend",
                "No increase in critical-reading rate " +
                "was reported among the compared centers."
            );
        }

        addInsight(
            "Temperature Comparison",

            `The largest absolute change in daily average ` +
            `temperature was ${maxTempChange.toFixed(2)}°C. ` +
            `Daily averages alone cannot confirm or rule ` +
            `out short-lived thermal hotspots.`
        );
    }

    // ======================================================
    // 5. POPULATE COMPARISON TABLE
    // ======================================================

    function renderTable(centers) {
        const tbody = section.querySelector(
            "#diTableBody"
        );

        tbody.replaceChildren();

        centers.forEach(center => {
            const row = document.createElement("tr");

            const nameCell = document.createElement("td");
            nameCell.className = "di-center-name";

            nameCell.textContent =
                center.data_center_id;

            const city = document.createElement("span");
            city.className = "di-city";
            city.textContent = center.city;

            nameCell.appendChild(city);
            row.appendChild(nameCell);

            row.appendChild(
                createChangeCell(
                    center.temperature_change_c,
                    "°C"
                )
            );

            row.appendChild(
                createChangeCell(
                    center.critical_rate_change_pp,
                    "pp"
                )
            );

            row.appendChild(
                createChangeCell(
                    center.cooling_rate_change_pp,
                    "pp"
                )
            );

            tbody.appendChild(row);
        });
    }

    // ======================================================
    // 6. RENDER ACTUAL INTELLIGENCE DATA
    // ======================================================

    function renderIntelligence(result) {
        const centers = result.data_centers || [];

        setValue(
            "diDate",
            `${result.previous_date} → ${result.process_date}`
        );

        setValue("diTotal", centers.length);

        const criticalIncreases = centers.filter(
            c => Number(c.critical_rate_change_pp) > 0
        ).length;

        const coolingIncreases = centers.filter(
            c => Number(c.cooling_rate_change_pp) > 0
        ).length;

        setValue("diCriticalUp", criticalIncreases);

        setValue("diCoolingUp", coolingIncreases);

        renderInsights(centers);
        renderTable(centers);

        setValue(
            "diStatus",
            `Showing actual Gold comparison for ` +
            `${centers.length} data centers.`
        );
    }

    // ======================================================
    // 7. FETCH FASTAPI INTELLIGENCE
    // ======================================================

    async function loadIntelligence() {
        if (loading || !section) return;

        loading = true;

        const button = section.querySelector(
            "#diRefresh"
        );

        button.disabled = true;
        button.textContent = "Loading...";

        try {
            const response = await fetch(
                API_URL,
                { cache: "no-store" }
            );

            if (!response.ok) {
                throw new Error(
                    `Intelligence API HTTP ${response.status}`
                );
            }

            const data = await response.json();

            if (
                data.status !== "success" ||
                !Array.isArray(data.data_centers) ||
                data.data_centers.length === 0
            ) {
                setValue(
                    "diStatus",
                    "No consecutive-day comparison available."
                );

                return;
            }

            renderIntelligence(data);

        } catch (error) {
            console.error(
                "Daily Intelligence Error:",
                error
            );

            setValue(
                "diStatus",
                "Unable to load intelligence data. " +
                "Check FastAPI on port 8000."
            );

        } finally {
            loading = false;

            button.disabled = false;

            button.textContent =
                "↻ Refresh Intelligence";
        }
    }

    // ======================================================
    // 8. INITIALIZE
    // ======================================================

    function initialize() {
        addStyles();
        createSection();
        loadIntelligence();
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initialize
        );
    } else {
        initialize();
    }

})();


/* ====================================================
   INTELLIGENCE — SEPARATE SIDEBAR PAGE
   Moves existing insights out of Overview.
==================================================== */

(() => {
    let intelligenceSection = null;

    function setupIntelligencePage() {

        // Existing intelligence section
        intelligenceSection =
            document.getElementById("diSection");

        const content = document.querySelector(
            "#secondaryPage .secondary-page-content"
        );

        if (!intelligenceSection || !content) {
            console.warn(
                "Intelligence section or page container not found."
            );
            return;
        }

        // Remove Intelligence from Overview.
        // Its API data and Refresh button still work.
        intelligenceSection.remove();

        // Styling for the dedicated page
        const style = document.createElement("style");

        style.textContent = `
            .secondary-page-content.di-page-active {
                display: block;
                padding: 22px;
                text-align: left;
                align-items: initial;
                justify-content: initial;
                min-height: 400px;
            }

            .di-page-active .di-section {
                margin: 0;
                width: 100%;
            }

            @media (max-width: 700px) {
                .secondary-page-content.di-page-active {
                    padding: 12px;
                }
            }
        `;

        document.head.appendChild(style);

        // Existing sidebar navigation handles
        // page visibility and active nav state.
        document.addEventListener("click", event => {

            const nav = event.target.closest(".nav-item");

            if (nav) {

                if (nav.dataset.page === "intelligence") {

                    content.classList.add(
                        "di-page-active"
                    );

                    content.replaceChildren(
                        intelligenceSection
                    );

                } else {

                    content.classList.remove(
                        "di-page-active"
                    );
                }
            }

            // Clear dedicated layout when navigating
            // using the notification or back buttons.
            if (
                event.target.closest("#notificationButton") ||
                event.target.closest("#viewAllAlerts") ||
                event.target.closest("#backToOverview")
            ) {
                content.classList.remove(
                    "di-page-active"
                );
            }

        });
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            setupIntelligencePage
        );
    } else {
        setupIntelligencePage();
    }

})();


/* ==========================================================
   ANOMALY DETECTION — INTELLIGENCE SIDEBAR PAGE

   Source:
   /api/intelligence/anomalies

   Add at the END of frontend/script.js
========================================================== */

(() => {
    "use strict";

    const API_URL =
       dashboardApi("anomalies");
    let panel = null;
    let loading = false;

    // ------------------------------------------------------
    // 1. STYLING
    // ------------------------------------------------------

    const style = document.createElement("style");

    style.textContent = `
        .anomaly-section {
            margin-top: 28px;
            padding-top: 22px;
            border-top: 1px solid var(--border-color);
            color: var(--text-primary);
        }

        .anomaly-heading {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 18px;
        }

        .anomaly-heading h2 {
            font-size: 17px;
            font-weight: 800;
        }

        .anomaly-heading p {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 6px;
        }

        .anomaly-refresh {
            padding: 10px 15px;
            background: linear-gradient(
                135deg, #0867ee, #428dff
            );
            border: none;
            border-radius: 9px;
            color: white;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
        }

        .anomaly-refresh:disabled {
            opacity: .6;
        }

        .anomaly-kpis {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 13px;
            margin-bottom: 20px;
        }

        .anomaly-kpi {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-left: 4px solid #ed6570;
            border-radius: 12px;
            padding: 19px;
        }

        .anomaly-kpi:nth-child(2) {
            border-left-color: #f4b544;
        }

        .anomaly-kpi:nth-child(3) {
            border-left-color: #2786ff;
        }

        .anomaly-kpi span {
            display: block;
            font-size: 11px;
            color: var(--text-secondary);
        }

        .anomaly-kpi strong {
            display: block;
            font-size: 26px;
            margin-top: 9px;
            font-weight: 800;
        }

        .anomaly-kpi small {
            display: block;
            font-size: 10px;
            margin-top: 7px;
            color: var(--text-secondary);
        }

        .anomaly-table-wrap {
            overflow-x: auto;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            background: var(--card-bg);
        }

        .anomaly-table {
            width: 100%;
            border-collapse: collapse;
        }

        .anomaly-table th {
            padding: 13px;
            text-align: left;
            font-size: 10px;
            color: var(--text-secondary);
            background: var(--card-subtle);
            white-space: nowrap;
        }

        .anomaly-table td {
            padding: 14px 13px;
            border-bottom: 1px solid var(--border-color);
            font-size: 11px;
            color: var(--text-primary);
            vertical-align: middle;
        }

        .anomaly-table tbody tr:last-child td {
            border-bottom: none;
        }

        .anomaly-table tbody tr:hover {
            background: var(--card-hover);
        }

        .anomaly-center {
            font-weight: 800;
            white-space: nowrap;
        }

        .anomaly-city {
            display: block;
            margin-top: 5px;
            color: var(--text-secondary);
            font-size: 10px;
            font-weight: 400;
        }

        .anomaly-status {
            display: inline-block;
            padding: 6px 9px;
            border-radius: 7px;
            font-weight: 800;
            font-size: 10px;
            white-space: nowrap;
        }

        .anomaly-status.high {
            background: rgba(239,98,105,.12);
            color: #e35e67;
        }

        .anomaly-status.review {
            background: rgba(244,181,68,.15);
            color: #cb9325;
        }

        .anomaly-status.none {
            background: rgba(39,134,255,.10);
            color: var(--primary-blue);
        }

        .anomaly-reason {
            min-width: 190px;
            line-height: 1.6;
            color: var(--text-secondary) !important;
        }

        .anomaly-footnote {
            margin-top: 16px;
            padding: 14px;
            background: var(--card-subtle);
            border-left: 3px solid #2786ff;
            border-radius: 8px;
            color: var(--text-secondary);
            font-size: 10px;
            line-height: 1.8;
        }

        .anomaly-message {
            font-size: 11px;
            color: var(--text-secondary);
            margin: 12px 0;
        }

        @media (max-width: 700px) {
            .anomaly-kpis {
                grid-template-columns: 1fr;
            }
        }
    `;

    document.head.appendChild(style);

    // ------------------------------------------------------
    // 2. CREATE PANEL
    // ------------------------------------------------------


    // ------------------------------------------------------
    // 2. CREATE ANOMALY DETECTION PAGE
    // ------------------------------------------------------

    const anomalyPageStyle = document.createElement("style");

    anomalyPageStyle.textContent = `
        .secondary-page-content.anomaly-page-active {
            display: block;
            text-align: left;
            padding: 22px;
            min-height: 400px;
        }

        .anomaly-page-active .anomaly-section {
            margin-top: 0;
            padding-top: 0;
            border-top: none;
            width: 100%;
        }
    `;

    document.head.appendChild(anomalyPageStyle);

    function mountPanel() {

        const container = document.querySelector(
            "#secondaryPage .secondary-page-content"
        );

        if (!container) {
            console.error("Anomaly page container not found");
            return;
        }

        // If panel is already on this page, just refresh.
        if (panel && container.contains(panel)) {
            container.classList.add("anomaly-page-active");
            loadAnomalies();
            return;
        }

        // Create the panel only once.
        if (!panel) {

            panel = document.createElement("section");

            panel.className = "anomaly-section";
            panel.id = "anomalyDetectionPanel";

            panel.innerHTML = `
                <div class="anomaly-heading">

                    <div>
                        <h2>
                            <i class="fa-solid fa-shield-halved"></i>
                            Anomaly Detection
                        </h2>

                        <p id="anomalyDate">
                            Rule-Based Investigation Priorities
                        </p>
                    </div>

                    <button
                        class="anomaly-refresh"
                        id="anomalyRefresh"
                        type="button"
                    >
                        ↻ Refresh Detection
                    </button>

                </div>

                <div class="anomaly-kpis">

                    <div class="anomaly-kpi">
                        <span>High Priority</span>

                        <strong id="anomalyHigh">—</strong>

                        <small>
                            Two or more rules triggered
                        </small>
                    </div>

                    <div class="anomaly-kpi">
                        <span>Review Required</span>

                        <strong id="anomalyReview">—</strong>

                        <small>
                            One rule triggered
                        </small>
                    </div>

                    <div class="anomaly-kpi">
                        <span>No Rule Triggered</span>

                        <strong id="anomalyNone">—</strong>

                        <small>
                            Does not confirm equipment health
                        </small>
                    </div>

                </div>

                <div class="anomaly-table-wrap">

                    <table class="anomaly-table">

                        <thead>
                            <tr>
                                <th>Data Center</th>
                                <th>Priority</th>
                                <th>Rules</th>
                                <th>Investigation Reason</th>
                            </tr>
                        </thead>

                        <tbody id="anomalyTable"></tbody>

                    </table>

                </div>

                <p
                    id="anomalyMessage"
                    class="anomaly-message"
                    role="status"
                ></p>

                <div class="anomaly-footnote">

                    <strong>Detection Method:</strong>

                    Rules compare daily average temperature,
                    critical-reading rate and cooling degradation
                    rate from Databricks Gold data.

                    These are prototype investigation thresholds,
                    not validated equipment safety limits.

                    A triggered rule is not proof of an anomaly
                    or its root cause.

                </div>
            `;

            panel.querySelector("#anomalyRefresh")
                .addEventListener(
                    "click",
                    loadAnomalies
                );
        }

        // Show ONLY anomaly content on its own page.
        // Moving this existing DOM element automatically
        // removes it from its previous parent, if any.

        container.replaceChildren(panel);

        container.classList.add("anomaly-page-active");

        // Fetch latest anomaly results.
        loadAnomalies();
    }

    // ------------------------------------------------------
    // 3. UPDATE TEXT
    // ------------------------------------------------------

    function setValue(id, value) {

        const target = panel?.querySelector(
            "#" + id
        );

        if (target) {
            target.textContent = String(value);
        }
    }

    // ------------------------------------------------------
    // 4. RENDER ANOMALY RESULTS
    // ------------------------------------------------------

    function renderResults(result) {

        const centers = result.data_centers || [];

        // Comparison dates
        setValue(
            "anomalyDate",
            `${result.previous_date || "—"} → ` +
            `${result.process_date || "—"}`
        );

        // High priority count
        setValue(
            "anomalyHigh",
            result.high_priority ?? 0
        );

        // Review required count
        setValue(
            "anomalyReview",
            result.review_required ?? 0
        );

        // No rule triggered count
        const noRuleCount = centers.filter(
            center =>
                center.priority === "NO_RULE_TRIGGERED"
        ).length;

        setValue(
            "anomalyNone",
            noRuleCount
        );

        // Table
        const tbody = panel.querySelector(
            "#anomalyTable"
        );

        tbody.replaceChildren();

        centers.forEach(center => {

            const row = document.createElement("tr");

            // ----------------------------------------------
            // DATA CENTER
            // ----------------------------------------------

            const nameCell = document.createElement("td");

            nameCell.className = "anomaly-center";

            const name = document.createElement("span");

            name.textContent = center.data_center_id;

            const city = document.createElement("span");

            city.className = "anomaly-city";

            city.textContent = center.city;

            nameCell.append(name, city);

            row.appendChild(nameCell);

            // ----------------------------------------------
            // PRIORITY STATUS
            // ----------------------------------------------

            const priorityCell = document.createElement("td");

            const badge = document.createElement("span");

            badge.className = "anomaly-status";

            if (center.priority === "HIGH") {

                badge.classList.add("high");

                badge.textContent = "HIGH";

            } else if (center.priority === "REVIEW") {

                badge.classList.add("review");

                badge.textContent = "REVIEW";

            } else {

                badge.classList.add("none");

                badge.textContent = "NO RULE";
            }

            priorityCell.appendChild(badge);

            row.appendChild(priorityCell);

            // ----------------------------------------------
            // NUMBER OF RULES TRIGGERED
            // ----------------------------------------------

            const countCell = document.createElement("td");

            countCell.textContent =
                center.rules_triggered ?? 0;

            row.appendChild(countCell);

            // ----------------------------------------------
            // INVESTIGATION REASON
            // ----------------------------------------------

            const reasonCell = document.createElement("td");

            reasonCell.className = "anomaly-reason";

            if (
                Array.isArray(center.reasons) &&
                center.reasons.length > 0
            ) {

                reasonCell.textContent =
                    center.reasons.join("; ");

            } else {

                reasonCell.textContent =
                    "No prototype rule triggered";
            }

            row.appendChild(reasonCell);

            tbody.appendChild(row);
        });

        // Bottom status message
        setValue(
            "anomalyMessage",
            `${centers.length} data centers analyzed using ` +
            `Databricks Gold daily comparisons.`
        );
    }

    // ------------------------------------------------------
    // 5. FETCH ANOMALY DETECTION API
    // ------------------------------------------------------

    async function loadAnomalies() {

        if (!panel || loading) return;

        loading = true;

        const button = panel.querySelector(
            "#anomalyRefresh"
        );

        button.disabled = true;

        button.textContent = "Loading...";

        try {

            const response = await fetch(
                API_URL,
                {
                    cache: "no-store"
                }
            );

            if (!response.ok) {

                throw new Error(
                    `Anomaly API HTTP ${response.status}`
                );
            }

            const result = await response.json();

            if (!Array.isArray(result.data_centers)) {

                throw new Error(
                    "Invalid anomaly API response"
                );
            }

            renderResults(result);

        } catch (error) {

            console.error(
                "Anomaly Detection Error:",
                error
            );

            setValue(
                "anomalyMessage",
                "Unable to load detection results. " +
                "Check FastAPI on port 8000."
            );

        } finally {

            loading = false;

            button.disabled = false;

            button.textContent = "↻ Refresh Detection";
        }
    }

    // ------------------------------------------------------
    // 6. SIDEBAR NAVIGATION
    // ------------------------------------------------------

    document.addEventListener("click", event => {

        const nav = event.target.closest(
            ".nav-item"
        );

        if (!nav) return;

        const container = document.querySelector(
            "#secondaryPage .secondary-page-content"
        );

        // Open Anomaly Detection as a separate page.
        if (nav.dataset.page === "anomalies") {

            // Wait for main navigation to update the page.
            setTimeout(() => {

                // Avoid mounting if the user has already
                // navigated to another page.
                const activeNav = document.querySelector(
                    ".nav-item.active"
                );

                if (
                    activeNav &&
                    activeNav.dataset.page !== "anomalies"
                ) {
                    return;
                }

                mountPanel();

            }, 150);

        } else {

            // Remove anomaly-specific page styling when
            // switching to another sidebar page.
            container?.classList.remove(
                "anomaly-page-active"
            );
        }
    });

})();


/* ============================================================
   END OF COMPLETE FRONTEND SCRIPT
============================================================ */

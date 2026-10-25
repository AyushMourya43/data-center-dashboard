
/*
 Data Center Dashboard - Server-side API Proxy

 Render API URL is stored in Vercel Environment Variables.
 Never expose Databricks credentials to the browser.
*/

const ENDPOINTS = {
    overview: "/api/overview",
    centers: "/api/data-centers",
    risk: "/api/risk-analysis",
    comparison: "/api/intelligence/daily-comparison",
    anomalies: "/api/intelligence/anomalies"
};

export default async function handler(req, res) {

    if (req.method !== "GET") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    const endpoint = req.query.endpoint;

    // Only allow our five dashboard endpoints.
    if (
        typeof endpoint !== "string" ||
        !Object.hasOwn(ENDPOINTS, endpoint)
    ) {
        return res.status(400).json({
            error: "Invalid endpoint"
        });
    }

    const baseURL = process.env.RENDER_API_URL
        ?.trim()
        .replace(/\/+$/, "");

    if (!baseURL || !baseURL.startsWith("https://")) {
        return res.status(503).json({
            error: "Backend configuration unavailable"
        });
    }

    try {
        const headers = {};

        // Used after backend authentication is enabled.
        if (process.env.INTERNAL_API_KEY) {
            headers["X-Internal-API-Key"] =
                process.env.INTERNAL_API_KEY;
        }

        const response = await fetch(
            baseURL + ENDPOINTS[endpoint],
            {
                method: "GET",
                headers,
                signal: AbortSignal.timeout(45000)
            }
        );

        if (!response.ok) {
            return res.status(502).json({
                error: "Backend request failed"
            });
        }

        const data = await response.json();

        // Cache shared daily summary responses briefly.
        res.setHeader(
            "Cache-Control",
            "public, s-maxage=300, stale-while-revalidate=600"
        );

        return res.status(200).json(data);

    } catch (error) {
        console.error("Dashboard proxy request failed");

        return res.status(502).json({
            error: "Data temporarily unavailable"
        });
    }
}

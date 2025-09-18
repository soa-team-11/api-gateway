import express from "express";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import jwt from "jsonwebtoken";

dotenv.config({ path: path.resolve("config.env") });

const app = express();
const PORT = process.env.PORT || 4000;

const requiredEnv = [
    "AUTH_SERVICE_URL",
    "STAKEHOLDERS_SERVICE_URL",
    "BLOG_SERVICE_URL",
    "TOUR_SERVICE_URL",
    "FOLLOWERS_SERVICE_URL",
];

requiredEnv.forEach((key) => {
    if (!process.env[key]) {
        console.error(`❌ Missing required environment variable: ${key}`);
        process.exit(1);
    }
});

console.log("Loaded service URLs:");
requiredEnv.forEach((key) => console.log(`${key} = ${process.env[key]}`));

// Middleware
app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

app.use(
    cors({
        origin: "http://localhost:5173",
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
    })
);

const verifyJWT = (req, res, next) => {
    // Exclude the authentication service routes from JWT check
    if (req.originalUrl.startsWith("/auth")) {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach user information to the request object
        next();
    } catch (err) {
        console.error("[Gateway] JWT verification failed:", err.message);
        return res.status(403).json({ message: "Invalid or expired token" });
    }
};

app.use(verifyJWT);

// Proxy routes
app.use(
    "/auth",
    createProxyMiddleware({
        target: process.env.AUTH_SERVICE_URL,
        changeOrigin: true,
        xfwd: true,
        timeout: 30000,
        proxyTimeout: 30000,
        logLevel: "debug",
        pathRewrite: (path) => {
            // Upstream auth service expects the "/auth" prefix
            return "/auth" + (path || "");
        },
        onProxyReq: (proxyReq, req, res) => {
            try {
                console.log(
                    `[Gateway] forwarding ${req.method} ${req.originalUrl} -> ${
                        process.env.AUTH_SERVICE_URL
                    }${proxyReq.path || ""}`
                );
            } catch (_) {}
        },
        onProxyRes: (proxyRes, req, res) => {
            const target = process.env.AUTH_SERVICE_URL;
            console.log(
                `[Gateway] ${req.method} ${req.originalUrl} -> ${target} (status: ${proxyRes.statusCode})`
            );
        },
        onError: (err, req, res) => {
            console.error(
                `[Gateway] Proxy error for ${req.method} ${req.originalUrl}:`,
                err.message
            );
            if (!res.headersSent) {
                res.status(502).json({
                    message: "Gateway failed to reach auth service",
                    error: err.message,
                });
            }
        },
    })
);

app.use(
    "/stakeholders",
    createProxyMiddleware({
        target: process.env.STAKEHOLDERS_SERVICE_URL,
        changeOrigin: true,
        xfwd: true,
        timeout: 30000,
        proxyTimeout: 30000,
        logLevel: "debug",
        onProxyReq: (proxyReq, req, res) => {
            try {
                console.log(
                    `[Gateway] forwarding ${req.method} ${req.originalUrl} -> ${
                        process.env.STAKEHOLDERS_SERVICE_URL
                    }${proxyReq.path || ""}`
                );
            } catch (_) {}
        },
        onProxyRes: (proxyRes, req, res) => {
            const target = process.env.STAKEHOLDERS_SERVICE_URL;
            console.log(
                `[Gateway] ${req.method} ${req.originalUrl} -> ${target} (status: ${proxyRes.statusCode})`
            );
        },
        onError: (err, req, res) => {
            console.error(
                `[Gateway] Proxy error for ${req.method} ${req.originalUrl}:`,
                err.message
            );
            if (!res.headersSent) {
                res.status(502).json({
                    message: "Gateway failed to reach stakeholders service",
                    error: err.message,
                });
            }
        },
    })
);

app.use(
    "/api/blog",
    createProxyMiddleware({
        target: process.env.BLOG_SERVICE_URL,
        changeOrigin: true,
        xfwd: true,
        timeout: 30000,
        proxyTimeout: 30000,
        logLevel: "debug",
        pathRewrite: (path) => {
            return "/api/blog" + (path || "");
        },
        onProxyReq: (proxyReq, req, res) => {
            try {
                console.log(
                    `[Gateway] forwarding ${req.method} ${req.originalUrl} -> ${
                        process.env.BLOG_SERVICE_URL
                    }${proxyReq.path || ""}`
                );
            } catch (_) {}
        },
        onProxyRes: (proxyRes, req, res) => {
            const target = process.env.BLOG_SERVICE_URL;
            console.log(
                `[Gateway] ${req.method} ${req.originalUrl} -> ${target} (status: ${proxyRes.statusCode})`
            );
        },
        onError: (err, req, res) => {
            console.error(
                `[Gateway] Proxy error for ${req.method} ${req.originalUrl}:`,
                err.message
            );
            if (!res.headersSent) {
                res.status(502).json({
                    message: "Gateway failed to reach blog service",
                    error: err.message,
                });
            }
        },
    })
);
app.use(
    "/api/tour",
    createProxyMiddleware({
        target: process.env.TOUR_SERVICE_URL,
        changeOrigin: true,
        xfwd: true,
        logLevel: "debug",
        timeout: 10000,
        proxyTimeout: 10000,
        pathRewrite: (path, req) => {
            // Express strips the mount path ("/api/tour") from req.url when using app.use("/api/tour", ...)
            // Re-attach it so the upstream receives "/api/tour/..." as expected
            const rewritten = "/api/tour" + (path || "");
            return rewritten;
        },
        // Let the proxy stream the body directly to avoid request abortion
        onProxyReq: (proxyReq, req, res) => {
            try {
                console.log(
                    `[Gateway] forwarding ${req.method} ${req.originalUrl} -> ${
                        process.env.TOUR_SERVICE_URL
                    }${proxyReq.path || ""}`
                );
            } catch (_) {}
        },
        onProxyRes: (proxyRes, req, res) => {
            const target = process.env.TOUR_SERVICE_URL;
            console.log(
                `[Gateway] ${req.method} ${req.originalUrl} -> ${target} (status: ${proxyRes.statusCode})`
            );
        },
        onError: (err, req, res) => {
            console.error(
                `[Gateway] Proxy error for ${req.method} ${req.originalUrl}:`,
                err.message
            );
            if (!res.headersSent) {
                res.status(502).json({
                    message: "Gateway failed to reach tour service",
                    error: err.message,
                });
            }
        },
    })
);

app.use(
    "/api/followers",
    createProxyMiddleware({
        target: process.env.FOLLOWERS_SERVICE_URL,
        changeOrigin: true,
        xfwd: true,
        logLevel: "debug",
        timeout: 10000,
        proxyTimeout: 10000,
        pathRewrite: { "^/api/followers": "" },
        onProxyReq: (proxyReq, req, res) => {
            try {
                console.log(
                    `[Gateway] forwarding ${req.method} ${req.originalUrl} -> ${
                        process.env.FOLLOWERS_SERVICE_URL
                    }${proxyReq.path || ""}`
                );
            } catch (_) {}
        },
        onProxyRes: (proxyRes, req, res) => {
            const target = process.env.FOLLOWERS_SERVICE_URL;
            console.log(
                `[Gateway] ${req.method} ${req.originalUrl} -> ${target} (status: ${proxyRes.statusCode})`
            );
        },
        onError: (err, req, res) => {
            console.error(
                `[Gateway] Proxy error for ${req.method} ${req.originalUrl}:`,
                err.message
            );
            if (!res.headersSent) {
                res.status(502).json({
                    message: "Gateway failed to reach followers service",
                    error: err.message,
                });
            }
        },
    })
);

// Health check
app.get("/health", (req, res) => res.send("API Gateway is running 🚀"));

// Global error handler to avoid hanging responses
app.use((err, req, res, next) => {
    console.error("[Gateway] Unhandled error:", err);
    if (!res.headersSent) {
        res.status(500).json({ message: "Gateway internal error" });
    }
});

// Start server
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));

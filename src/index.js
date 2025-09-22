import express from "express";
import { logger, morganMiddleware } from "./logger.js";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import jwt from "jsonwebtoken";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

const requiredEnv = [
    "AUTH_SERVICE_URL",
    "STAKEHOLDERS_SERVICE_URL",
    "BLOG_SERVICE_URL",
    "TOUR_SERVICE_URL",
    "FOLLOWERS_SERVICE_URL",
    "PAYMENTS_SERVICE_URL",
];

const missingVars = requiredEnv.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
    logger.fatal("Missing required environment variables", { missingVars });
    process.exit(1);
}

logger.info("Loaded all service URLs");

// Middleware
app.use(morganMiddleware);
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
        req.user = decoded;
        next();
    } catch (err) {
        logger.warn({ err }, "[Gateway] JWT verification failed");
        return res.status(403).json({ message: "Invalid or expired token" });
    }
};

app.use(verifyJWT);

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
            return "/auth" + (path || "");
        },
        onProxyReq: (proxyReq, req, res) => {
            try {
                logger.info(
                    `[Gateway] forwarding ${req.method} ${req.originalUrl} -> ${process.env.AUTH_SERVICE_URL
                    }${proxyReq.path || ""}`
                );
            } catch (_) { }
        },
        onProxyRes: (proxyRes, req, res) => {
            const target = process.env.AUTH_SERVICE_URL;
            logger.info(
                `[Gateway] ${req.method} ${req.originalUrl} -> ${target} (status: ${proxyRes.statusCode})`
            );
        },
        onError: (err, req, res) => {
            logger.error(
                { err },
                `[Gateway] Proxy error for ${req.method} ${req.originalUrl}:`
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

const PROTO_PATH = path.resolve("proto/blog.proto");
const packageDef = protoLoader.loadSync(PROTO_PATH, {});
const grpcObj = grpc.loadPackageDefinition(packageDef);
const blogPackage = grpcObj.blog;

const blogClient = new blogPackage.BlogService(
    process.env.BLOG_SERVICE_GRPC_HOST,
    grpc.credentials.createInsecure()
);

app.post("/api/blog", express.json({ limit: "50mb" }), (req, res) => {
    const { author, title, description, images } = req.body;
    console.log("stigo")

    blogClient.Create({ author, title, description, images }, (err, response) => {
        if (err) {
            console.error("[Gateway] gRPC CreateBlog error:", err);
            return res.status(err.code === grpc.status.NOT_FOUND ? 404 : 500).json({ message: err.message });
        }

        res.status(201).json(response);
    });
});

app.patch("/api/blog/comment", express.json(), (req, res) => {
  const { blogId, author, text } = req.body;


    blogClient.PostComment({ blogId, author, text }, (err, response) => {
        if (err) {
            console.error("[Gateway] gRPC PostComment error:", err);
            return res
                .status(err.code === grpc.status.NOT_FOUND ? 404 : 500)
                .json({ message: err.message });
        }

        res.status(201).json(response);
    });
});

const TOUR_PROTO_PATH = path.resolve("proto/tour.proto");
const tourPackageDef = protoLoader.loadSync(TOUR_PROTO_PATH, {});
const tourGrpcObj = grpc.loadPackageDefinition(tourPackageDef);
const tourPackage = tourGrpcObj.tour;

const tourClient = new tourPackage.TourService(
    process.env.TOUR_SERVICE_GRPC_HOST,
    grpc.credentials.createInsecure(),
    {
        'grpc.max_send_message_length': 50 * 1024 * 1024, // 50 MB
        'grpc.max_receive_message_length': 50 * 1024 * 1024, // 50 MB
    }
);

app.post("/api/tour", express.json({ limit: "50mb" }), (req, res) => {
    const { author, title, description, difficulty, price, tags, keyPoints, durations, length } =
        req.body;

    tourClient.CreateTour(
        { author, title, description, difficulty, price, tags, keyPoints, durations, length },
        (err, response) => {
            if (err) {
                console.error("[Gateway] gRPC CreateTour error:", err);
                return res
                    .status(err.code === grpc.status.NOT_FOUND ? 404 : 500)
                    .json({ message: err.message });
            }

            res.status(201).json(response);
        }
    );
});


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
                logger.info(
                    `[Gateway] forwarding ${req.method} ${req.originalUrl} -> ${process.env.STAKEHOLDERS_SERVICE_URL
                    }${proxyReq.path || ""}`
                );
            } catch (_) { }
        },
        onProxyRes: (proxyRes, req, res) => {
            const target = process.env.STAKEHOLDERS_SERVICE_URL;
            logger.info(
                `[Gateway] ${req.method} ${req.originalUrl} -> ${target} (status: ${proxyRes.statusCode})`
            );
        },
        onError: (err, req, res) => {
            logger.error(
                { err },
                `[Gateway] Proxy error for ${req.method} ${req.originalUrl}:`
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
                logger.info(
                    `[Gateway] forwarding ${req.method} ${req.originalUrl} -> ${process.env.BLOG_SERVICE_URL
                    }${proxyReq.path || ""}`
                );
            } catch (_) { }
        },
        onProxyRes: (proxyRes, req, res) => {
            const target = process.env.BLOG_SERVICE_URL;
            logger.info(
                `[Gateway] ${req.method} ${req.originalUrl} -> ${target} (status: ${proxyRes.statusCode})`
            );
        },
        onError: (err, req, res) => {
            logger.error(
                { err },
                `[Gateway] Proxy error for ${req.method} ${req.originalUrl}:`
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
            const rewritten = "/api/tour" + (path || "");
            return rewritten;
        },
        onProxyReq: (proxyReq, req, res) => {
            try {
                logger.info(
                    `[Gateway] forwarding ${req.method} ${req.originalUrl} -> ${process.env.TOUR_SERVICE_URL
                    }${proxyReq.path || ""}`
                );
            } catch (_) { }
        },
        onProxyRes: (proxyRes, req, res) => {
            const target = process.env.TOUR_SERVICE_URL;
            logger.info(
                `[Gateway] ${req.method} ${req.originalUrl} -> ${target} (status: ${proxyRes.statusCode})`
            );
        },
        onError: (err, req, res) => {
            logger.error(
                { err },
                `[Gateway] Proxy error for ${req.method} ${req.originalUrl}:`
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
    "/api/tour-execution",
    createProxyMiddleware({
        target: process.env.TOUR_SERVICE_URL,
        changeOrigin: true,
        xfwd: true,
        logLevel: "debug",
        timeout: 10000,
        proxyTimeout: 10000,
        pathRewrite: (path) => "/api/tour-execution" + (path || ""),
        onProxyReq: (proxyReq, req, res) => {
            logger.info(`[Gateway] forwarding ${req.method} ${req.originalUrl} -> ${target}${proxyReq.path || ""}`);
        },
        onProxyRes: (proxyRes, req, res) => {
            logger.info(`[Gateway] ${req.method} ${req.originalUrl} -> ${target} (status: ${proxyRes.statusCode})`);
        },
        onError: (err, req, res) => {
            logger.error({ err }, `[Gateway] Proxy error for ${req.method} ${req.originalUrl}:`);
            if (!res.headersSent) {
                res.status(502).json({ message: "Gateway failed to reach tour service", error: err.message });
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
                logger.info(
                    `[Gateway] forwarding ${req.method} ${req.originalUrl} -> ${process.env.FOLLOWERS_SERVICE_URL
                    }${proxyReq.path || ""}`
                );
            } catch (_) { }
        },
        onProxyRes: (proxyRes, req, res) => {
            const target = process.env.FOLLOWERS_SERVICE_URL;
            logger.info(
                `[Gateway] ${req.method} ${req.originalUrl} -> ${target} (status: ${proxyRes.statusCode})`
            );
        },
        onError: (err, req, res) => {
            logger.error(
                { err },
                `[Gateway] Proxy error for ${req.method} ${req.originalUrl}:`
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

app.use(
    "/api/carts",
    createProxyMiddleware({
        target: process.env.PAYMENTS_SERVICE_URL,
        changeOrigin: true,
        xfwd: true,
        logLevel: "debug",
        timeout: 10000,
        proxyTimeout: 10000,
        pathRewrite: (path, req) => {
            const rewritten = "/api/carts" + (path || "");
            return rewritten;
        },
        onProxyReq: (proxyReq, req, res) => {
            try {
                logger.info(
                    `[Gateway] forwarding ${req.method} ${req.originalUrl} -> ${process.env.PAYMENTS_SERVICE_URL
                    }${proxyReq.path || ""}`
                );
            } catch (_) { }
        },
        onProxyRes: (proxyRes, req, res) => {
            const target = process.env.PAYMENTS_SERVICE_URL;
            logger.info(
                `[Gateway] ${req.method} ${req.originalUrl} -> ${target} (status: ${proxyRes.statusCode})`
            );
        },
        onError: (err, req, res) => {
            logger.error(
                { err },
                `[Gateway] Proxy error for ${req.method} ${req.originalUrl}:`
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

app.get("/health", (req, res) => res.send("API Gateway is running 🚀"));

// Global error handler to avoid hanging responses
app.use((err, req, res, next) => {
    logger.error({ err }, "[Gateway] Unhandled error");
    if (!res.headersSent) {
        res.status(500).json({ message: "Gateway internal error" });
    }
});

app.listen(PORT, () => logger.info(`API Gateway running on port ${PORT}`));

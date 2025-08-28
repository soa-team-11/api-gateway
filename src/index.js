import express from "express";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve("config.env") });

const app = express();
const PORT = process.env.PORT || 8080;

const requiredEnv = [
  "AUTH_SERVICE_URL",
  "STAKEHOLDERS_SERVICE_URL",
  "BLOG_SERVICE_URL",
  "TOUR_SERVICE_URL"
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
app.use(express.json());
app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// Proxy routes
app.use("/auth", createProxyMiddleware({ target: process.env.AUTH_SERVICE_URL, changeOrigin: true }));
app.use("/stakeholders", createProxyMiddleware({ target: process.env.STAKEHOLDERS_SERVICE_URL, changeOrigin: true }));
app.use("/blog", createProxyMiddleware({ target: process.env.BLOG_SERVICE_URL, changeOrigin: true }));
app.use("/tours", createProxyMiddleware({ target: process.env.TOUR_SERVICE_URL, changeOrigin: true }));

// Health check
app.get("/health", (req, res) => res.send("API Gateway is running 🚀"));

// Start server
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));

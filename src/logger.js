import pino from "pino";
import morgan from "morgan";

export const logger = pino({
    formatters: {
        level(label) {
            return { level: label };
        },
    },
});

export const morganMiddleware = morgan(
    (tokens, req, res) =>
        JSON.stringify({
            method: tokens.method(req, res),
            url: tokens.url(req, res),
            status: Number(tokens.status(req, res)),
            response_time: Number(tokens["response-time"](req, res)),
            content_length: tokens.res(req, res, "content-length"),
        }),
    {
        stream: {
            write: (message) => {
                const data = JSON.parse(message);
                logger.info(data, "[HTTP]");
            },
        },
    }
);

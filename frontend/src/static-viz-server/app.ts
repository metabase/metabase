// Standalone static-viz rendering service — a small, dependency-light Node HTTP server that exposes
// the static-viz bundle over HTTP so Metabase can render charts and table cell colors out of process
// (the `:remote` renderer in metabase.channel.render.js.remote). No auth and no request logging by
// design; it is meant to run behind Metabase on a private network.
//
// The rendering code assumes a browser-like global environment (document, window, ResizeObserver, …)
// that Node doesn't provide, so the same shim GraalVM uses is installed here before anything renders.
import { type IncomingMessage, type ServerResponse, createServer } from "http";

import "../static-viz-graalvm/environment";

import { getCellBackgroundColors, renderChart } from "metabase/static-viz";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
// Cap request bodies so a malformed or oversized payload can't exhaust memory.
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES ?? 64 * 1024 * 1024);

// Each route parses the JSON request body into the typed input, renders, and serializes the result.
const routes: Record<string, (body: string) => string> = {
  "/api/v1/chart": (body) => JSON.stringify(renderChart(JSON.parse(body))),
  "/api/v1/cell-background-colors": (body) =>
    JSON.stringify(getCellBackgroundColors(JSON.parse(body))),
};

class PayloadTooLargeError extends Error {}

function send(res: ServerResponse, status: number, body = ""): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    req.on("data", (chunk: Uint8Array) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new PayloadTooLargeError());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer((req, res) => {
  // Liveness/readiness probe for load balancers and orchestrators.
  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, JSON.stringify({ status: "ok" }));
    return;
  }

  const handler = req.url ? routes[req.url] : undefined;
  if (!handler) {
    send(res, 404);
    return;
  }
  if (req.method !== "POST") {
    send(res, 405);
    return;
  }

  readBody(req).then(
    (body) => {
      try {
        send(res, 200, handler(body));
      } catch {
        // Malformed JSON or a rendering failure — nothing useful (or safe) to return in the body.
        send(res, 400);
      }
    },
    (error) => {
      send(res, error instanceof PayloadTooLargeError ? 413 : 400);
    },
  );
});

server.listen(PORT, HOST, () => {
  console.log(`static-viz server listening on ${HOST}:${PORT}`);
});

// Shut down cleanly so in-flight renders finish and orchestrators see a graceful exit.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

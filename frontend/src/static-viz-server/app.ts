import "metabase/static-viz/polyfill";

import { getCellBackgroundColors, renderChart } from "metabase/static-viz";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES ?? 64 * 1024 * 1024);

type Handler = (body: string) => string;

const routes: Record<string, Record<string, Handler>> = {
  GET: {
    "/api/v1/health": () => JSON.stringify({ status: "ok" }),
  },
  POST: {
    "/api/v1/chart": (body) => JSON.stringify(renderChart(JSON.parse(body))),
    "/api/v1/cell-background-colors": (body) =>
      JSON.stringify(getCellBackgroundColors(JSON.parse(body))),
  },
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
  const handler =
    req.method && req.url ? routes[req.method]?.[req.url] : undefined;
  if (!handler) {
    send(res, 404);
    return;
  }

  readBody(req).then(
    (body) => {
      try {
        send(res, 200, handler(body));
      } catch {
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

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

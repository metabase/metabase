import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const [rootArg, portArg] = process.argv.slice(2);
if (!rootArg || !portArg) {
  console.error("Usage: node static-server.mjs <directory> <port>");
  process.exit(1);
}

const root = path.resolve(rootArg);
const port = Number(portArg);

const CONTENT_TYPES = {
  ".css": "text/css",
  ".eot": "application/vnd.ms-fontobject",
  ".gif": "image/gif",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".mjs": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
};

// Webpack puts a content hash in these names: `1126.3fb6eb57.iframe.bundle.js`, `0bdc3ba1739c2c58e3a2.svg`.
const HASHED_FILE_NAME = /(^|\.)[0-9a-f]{8,}\.[^/]+$/;

async function resolveFile(urlPath) {
  const filePath = path.join(root, decodeURIComponent(urlPath));
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    return null;
  }
  const stats = await stat(filePath).catch(() => null);
  if (stats?.isDirectory()) {
    return resolveFile(path.posix.join(urlPath, "index.html"));
  }
  return stats?.isFile() ? { filePath, stats } : null;
}

function matchesETag(ifNoneMatch, etag) {
  return ifNoneMatch
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .some((tag) => tag === etag || tag === "*");
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  const file = await resolveFile(pathname);
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  const { filePath, stats } = file;
  const etag = `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
  const cacheHeaders = {
    ETag: etag,
    "Cache-Control": HASHED_FILE_NAME.test(path.basename(filePath))
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  };
  const ifNoneMatch = request.headers["if-none-match"];
  if (ifNoneMatch && matchesETag(ifNoneMatch, etag)) {
    response.writeHead(304, cacheHeaders).end();
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    ...cacheHeaders,
    "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    "Content-Length": stats.size,
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Serving ${root} on http://localhost:${port}`);
});

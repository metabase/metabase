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

async function resolveFile(urlPath) {
  const filePath = path.join(root, decodeURIComponent(urlPath));
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    return null;
  }
  const stats = await stat(filePath).catch(() => null);
  if (stats?.isDirectory()) {
    return resolveFile(path.posix.join(urlPath, "index.html"));
  }
  return stats?.isFile() ? filePath : null;
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  const filePath = await resolveFile(pathname);
  if (!filePath) {
    response.writeHead(404).end();
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Serving ${root} on http://localhost:${port}`);
});

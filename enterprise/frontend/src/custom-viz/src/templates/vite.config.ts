/* eslint-disable no-console, import/no-default-export, @typescript-eslint/no-require-imports */
import { cpSync, existsSync, readFileSync, watch } from "fs";
import { type ServerResponse, createServer } from "http";
import { createRequire } from "module";
import { resolve } from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __require = createRequire(import.meta.url);

/**
 * Vite plugin that copies metabase-plugin.json to dist/ after the build.
 */
function metabaseCopyManifest() {
  return {
    name: "metabase-copy-manifest",
    closeBundle() {
      const manifestSrc = resolve(__dirname, "metabase-plugin.json");
      if (existsSync(manifestSrc)) {
        cpSync(manifestSrc, resolve(__dirname, "dist/metabase-plugin.json"));
      } else {
        throw new Error("metabase-plugin.json missing");
      }
    },
  };
}

const DEV_PORT = 5174;

/**
 * Vite plugin that starts a dev server serving both static files from dist/
 * and an SSE endpoint at /__sse for hot-reload notifications.
 * Metabase's frontend connects to /__sse on the same origin as dev_bundle_url.
 */
function metabaseDevServer() {
  const clients = new Set<ServerResponse>();
  let landingPageHtml: string | undefined;
  let server: ReturnType<typeof createServer> | null = null;

  return {
    name: "metabase-dev-server",

    buildStart() {
      if (server) {
        return;
      }

      const distDir = resolve(__dirname, "dist");

      server = createServer((req, res) => {
        const url = req.url ?? "/";

        // SSE endpoint for hot-reload
        if (url === "/__sse") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
          });
          clients.add(res);
          req.on("close", () => clients.delete(res));
          return;
        }

        // Landing page with sync instructions
        if (url === "/") {
          if (!landingPageHtml) {
            try {
              const landingPath = __require.resolve(
                "@metabase/custom-viz/dev-server-landing.html",
              );
              landingPageHtml = readFileSync(landingPath, "utf-8");
            } catch {
              landingPageHtml =
                "<html><body><p>Custom viz dev server running.</p></body></html>";
            }
          }
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(landingPageHtml);
          return;
        }

        // CORS headers for all static responses
        res.setHeader("Access-Control-Allow-Origin", "*");

        // Serve static files from dist/
        const { readFile, stat } = require("fs");
        const { join, extname } = require("path");

        const filePath =
          url === "/" ? join(distDir, "index.html") : join(distDir, url);

        // Prevent directory traversal
        if (!filePath.startsWith(distDir)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        stat(filePath, (err: NodeJS.ErrnoException | null) => {
          if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
          }

          const mimeTypes: Record<string, string> = {
            ".html": "text/html",
            ".js": "application/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
          };
          const contentType =
            mimeTypes[extname(filePath)] ?? "application/octet-stream";

          readFile(
            filePath,
            (readErr: NodeJS.ErrnoException | null, data: Buffer) => {
              if (readErr) {
                res.writeHead(500);
                res.end("Internal server error");
                return;
              }
              res.writeHead(200, { "Content-Type": contentType });
              res.end(data);
            },
          );
        });
      });

      server.listen(DEV_PORT, () => {
        console.log(
          `[custom-viz] Dev server listening on http://localhost:${DEV_PORT}`,
        );
        console.log(
          `[custom-viz] Open http://localhost:${DEV_PORT} for setup instructions`,
        );
      });

      // Watch public/assets/ for changes — copy to dist/assets/ and notify
      const assetsDir = resolve(__dirname, "public/assets");
      if (existsSync(assetsDir)) {
        watch(assetsDir, { recursive: true }, (_event, filename) => {
          if (!filename) {
            return;
          }
          cpSync(
            resolve(assetsDir, filename),
            resolve(__dirname, "dist/assets", filename),
          );
          for (const client of clients) {
            client.write("data: reload\n\n");
          }
          console.log(
            `[custom-viz] Asset changed: ${filename}, notified ${clients.size} client(s)`,
          );
        });
      }
    },

    closeBundle() {
      for (const client of clients) {
        client.write("data: reload\n\n");
      }
      console.log(
        `[custom-viz] Build complete, notified ${clients.size} client(s)`,
      );
    },
  };
}

const isWatch = process.argv.includes("--watch");

export default defineConfig({
  plugins: [
    react(),
    metabaseCopyManifest(),
    ...(isWatch ? [metabaseDevServer()] : []),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  publicDir: "public",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": JSON.stringify({}),
  },
  build: {
    outDir: "dist",
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      formats: ["iife"],
      fileName: () => "index.js",
      name: "__customVizPlugin__",
    },
  },
});

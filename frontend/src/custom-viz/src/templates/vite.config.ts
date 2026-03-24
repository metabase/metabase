import { resolve } from "path";
import { createServer } from "http";
import { defineConfig } from "vite";

/**
 * Vite plugin that replaces `react` and `react/jsx-runtime` imports with
 * virtual modules that read from Metabase's `window.__METABASE_VIZ_API__`.
 *
 * This is necessary because the ES module output format cannot use
 * `output.globals`, and bare `import 'react'` would fail in the browser.
 */
function metabaseVizExternals() {
  const VIRTUAL_REACT = "\0virtual:react";
  const VIRTUAL_JSX_RUNTIME = "\0virtual:react/jsx-runtime";

  return {
    name: "metabase-viz-externals",
    enforce: "pre" as const,

    resolveId(source) {
      if (source === "react") {
        return VIRTUAL_REACT;
      }
      if (source === "react/jsx-runtime") {
        return VIRTUAL_JSX_RUNTIME;
      }
      return null;
    },

    load(id) {
      if (id === VIRTUAL_REACT) {
        return [
          "const React = window.__METABASE_VIZ_API__.React;",
          "export default React;",
          "export const { useState, useEffect, useRef, useCallback, useMemo, useReducer, useContext, createElement, Fragment } = React;",
        ].join("\n");
      }
      if (id === VIRTUAL_JSX_RUNTIME) {
        return [
          "const jsxRuntime = window.__METABASE_VIZ_API__.jsxRuntime;",
          "export const { jsx, jsxs, Fragment } = jsxRuntime;",
        ].join("\n");
      }
      return null;
    },
  };
}

const NOTIFY_PORT = 5175;

/**
 * Vite plugin that starts a tiny SSE server and sends a "reload" event
 * to all connected clients after each rebuild completes.
 * Metabase's frontend connects to this to live-reload the custom viz.
 */
function metabaseNotifyReload() {
  const clients = new Set<import("http").ServerResponse>();
  let server: ReturnType<typeof createServer> | null = null;

  return {
    name: "metabase-notify-reload",

    buildStart() {
      if (server) {
        return;
      }
      server = createServer((req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        clients.add(res);
        req.on("close", () => clients.delete(res));
      });
      server.listen(NOTIFY_PORT, () => {
        console.log(
          `[metabase-notify] SSE server listening on http://localhost:${NOTIFY_PORT}`,
        );
      });
    },

    closeBundle() {
      for (const client of clients) {
        client.write("data: reload\n\n");
      }
      console.log(
        `[metabase-notify] Build complete, notified ${clients.size} client(s)`,
      );
    },
  };
}

const isWatch = process.argv.includes("--watch");

export default defineConfig({
  plugins: [metabaseVizExternals(), ...(isWatch ? [metabaseNotifyReload()] : [])],
  publicDir: "public",
  build: {
    outDir: "dist",
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      formats: ["iife"],
      fileName: () => "index.js",
      name: "__customVizPlugin__",
    },
  },
  preview: {
    port: 5174,
    host: true,
    cors: true,
  },
});

import path from "node:path";

import react from "@vitejs/plugin-react";
import { type Plugin, build } from "vite";

import {
  DATA_APP_ENTRY,
  DATA_APP_EXTERNALS,
  DATA_APP_FACTORY_GLOBAL,
  DATA_APP_GLOBALS,
} from "./data-app-bundle";

/** Dev-only URL the harness fetches the freshly-built IIFE bundle from. */
export const DATA_APP_BUNDLE_URL = "/@data-app-bundle.js";

/**
 * Makes `npm run dev` run the app through the real Near-Membrane sandbox instead
 * of mounting it un-sandboxed, so dev behaves like production — including for
 * third-party libraries the app bundles.
 *
 * The membrane evaluates a code string, not Vite's module graph, so the app is
 * bundled in-memory (identically to the production bundle) on server start and
 * on every `src/` change, served at `DATA_APP_BUNDLE_URL`, with a full reload on
 * change. That trades module-level HMR for fidelity to production — the whole
 * point of a single, always-sandboxed dev environment.
 */
export function dataAppSandboxDevPlugin(allowedHosts: string[]): Plugin {
  let bundleCode = "";

  // Built in the dev server's own mode (development by default), so the
  // sandboxed app runs with dev React — jsxDEV warnings, `NODE_ENV=development`,
  // unminified — while a `--mode production` run mirrors the shipped bundle. The
  // membrane + distortion rules are identical either way; only the React build
  // differs, exactly as it does for any web app between dev and prod.
  const rebuild = async (root: string, mode: string) => {
    const result = await build({
      root,
      mode,
      configFile: false,
      logLevel: "warn",
      build: {
        write: false,
        minify: mode === "production",
        lib: {
          entry: DATA_APP_ENTRY,
          formats: ["iife"],
          name: DATA_APP_FACTORY_GLOBAL,
          fileName: () => "data-app-bundle.js",
        },
        rollupOptions: {
          external: DATA_APP_EXTERNALS,
          output: { globals: DATA_APP_GLOBALS },
        },
      },
      plugins: [react()],
    });

    const outputs = Array.isArray(result) ? result : [result];
    const chunk = outputs
      .flatMap((bundle) => ("output" in bundle ? bundle.output : []))
      .find((file) => file.type === "chunk");

    bundleCode = chunk && chunk.type === "chunk" ? chunk.code : "";
  };

  return {
    name: "data-app-sandbox-dev",
    apply: "serve",

    config() {
      return {
        define: {
          __DATA_APP_ALLOWED_HOSTS__: JSON.stringify(allowedHosts),
          __DATA_APP_BUNDLE_URL__: JSON.stringify(DATA_APP_BUNDLE_URL),
        },
      };
    },

    async configureServer(server) {
      const { root, mode } = server.config;

      await rebuild(root, mode);

      server.middlewares.use((req, res, next) => {
        if (req.url === DATA_APP_BUNDLE_URL) {
          res.setHeader("Content-Type", "text/javascript");
          res.end(bundleCode);
          return;
        }
        next();
      });

      const srcDir = `${path.sep}src${path.sep}`;
      server.watcher.on("change", async (file) => {
        if (file.includes(srcDir)) {
          await rebuild(root, mode);
          server.ws.send({ type: "full-reload" });
        }
      });
    },
  };
}

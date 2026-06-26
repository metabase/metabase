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

/** Custom HMR event the harness listens for to soft-reload the sandboxed app. */
export const DATA_APP_REBUILT_EVENT = "data-app:rebuilt";

/**
 * Makes `npm run dev` run the app through the real Near-Membrane sandbox instead
 * of mounting it un-sandboxed, so dev behaves like production — including for
 * third-party libraries the app bundles.
 *
 * The membrane evaluates a code string, not Vite's module graph, so the app is
 * bundled in-memory (identically to the production bundle) on server start and
 * on every `src/` change, served at `DATA_APP_BUNDLE_URL`. Instead of a full
 * page reload, it emits `DATA_APP_REBUILT_EVENT` so the harness re-evaluates the
 * new bundle in the live sandbox and re-renders in place — preserving the loaded
 * SDK bundle + auth. True module-level HMR / Fast Refresh isn't possible (the
 * app is an opaque evaluated bundle in an isolated realm), so component state
 * still resets on each change.
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
          __DATA_APP_REBUILT_EVENT__: JSON.stringify(DATA_APP_REBUILT_EVENT),
        },
      };
    },

    async configureServer(server) {
      const { root, mode } = server.config;

      // Serialize rebuilds: never run two `build()`s at once, and coalesce
      // changes that arrive mid-rebuild into a single follow-up so we always
      // serve and announce the latest bundle. Failures are logged (not left as
      // unhandled rejections), and the last good `bundleCode` is kept.
      let rebuilding = false;
      let pending = false;
      const rebuildAndNotify = async (notify: boolean) => {
        if (rebuilding) {
          pending = true;
          return;
        }
        rebuilding = true;
        try {
          do {
            pending = false;
            await rebuild(root, mode);
          } while (pending);
          if (notify) {
            // Soft reload: the harness re-evaluates the rebuilt bundle in the
            // live sandbox and re-renders in place (preserving the loaded SDK +
            // auth), instead of a full page reload. See `DATA_APP_REBUILT_EVENT`.
            server.ws.send({ type: "custom", event: DATA_APP_REBUILT_EVENT });
          }
        } catch (error) {
          server.config.logger.error(
            `[data-app-sandbox] failed to build the app bundle: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        } finally {
          rebuilding = false;
        }
      };

      await rebuildAndNotify(false);

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
          await rebuildAndNotify(true);
        }
      });
    },
  };
}

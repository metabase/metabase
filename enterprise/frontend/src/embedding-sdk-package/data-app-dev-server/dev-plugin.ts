import fs from "node:fs";
import path from "node:path";

import { type Plugin, build } from "vite";

import { dataAppBuildPlugins, dataAppLibBuild } from "./build-config";
import { DATA_APP_BUNDLE_URL, DATA_APP_REBUILT_EVENT } from "./bundle";

// Virtual modules the dev server provides. The template's `index.html` imports
// the harness; the harness imports the config (the app's allowed hosts + the
// bundle URL/event). The harness is served verbatim from `harness.ts` — shipped
// next to this bundle in `dist` — so it runs in the consumer's app, resolving
// its React + `@metabase/embedding-sdk-react`, and is never compiled here.
const HARNESS_VIRTUAL_ID = "virtual:metabase-data-app-dev-harness";
const CONFIG_VIRTUAL_ID = "virtual:metabase-data-app-dev-config";
const HARNESS_SOURCE_PATH = path.join(__dirname, "data-app-dev-harness.ts");

/**
 * Makes `npm run dev` run the app through the real Near-Membrane sandbox instead
 * of mounting it un-sandboxed, so dev behaves like production — including for
 * third-party libraries the app bundles.
 *
 * The membrane evaluates a code string, not Vite's module graph, so the app is
 * built in-memory as the production IIFE on server start and on every `src/`
 * change, served at `DATA_APP_BUNDLE_URL`. Instead of a full page reload it emits
 * `DATA_APP_REBUILT_EVENT`, and the harness re-evaluates the new bundle in the
 * live sandbox and re-renders in place — preserving the loaded SDK + auth (a
 * soft reload; component state still resets, since the app is an opaque bundle).
 */
export function dataAppSandboxDevPlugin(allowedHosts: string[]): Plugin {
  let bundleCode = "";

  // Built in the dev server's own mode (development by default), so the
  // sandboxed app runs with dev React — jsxDEV warnings, unminified — while a
  // `--mode production` run mirrors the shipped bundle. The membrane + distortion
  // rules are identical either way; only the React build differs.
  const rebuild = async (root: string, mode: string) => {
    const result = await build({
      root,
      mode,
      configFile: false,
      logLevel: "warn",
      plugins: dataAppBuildPlugins(),
      build: {
        write: false,
        minify: mode === "production",
        ...dataAppLibBuild("data-app-bundle.js"),
      },
    });

    const outputs = Array.isArray(result) ? result : [result];
    const chunk = outputs
      .flatMap((bundle) => ("output" in bundle ? bundle.output : []))
      .find((file) => file.type === "chunk");

    bundleCode = chunk && chunk.type === "chunk" ? chunk.code : "";
  };

  return {
    name: "metabase-data-app-dev",
    apply: "serve",

    resolveId(id) {
      if (id === HARNESS_VIRTUAL_ID || id === CONFIG_VIRTUAL_ID) {
        return "\0" + id;
      }
    },

    load(id) {
      if (id === "\0" + HARNESS_VIRTUAL_ID) {
        return fs.readFileSync(HARNESS_SOURCE_PATH, "utf8");
      }
      if (id === "\0" + CONFIG_VIRTUAL_ID) {
        return [
          `export const allowedHosts = ${JSON.stringify(allowedHosts)};`,
          `export const bundleUrl = ${JSON.stringify(DATA_APP_BUNDLE_URL)};`,
          `export const rebuiltEvent = ${JSON.stringify(DATA_APP_REBUILT_EVENT)};`,
        ].join("\n");
      }
    },

    async configureServer(server) {
      const { root, mode } = server.config;

      // Serialize rebuilds: never run two `build()`s at once, and coalesce
      // changes that arrive mid-rebuild into a single follow-up so we always
      // serve and announce the latest bundle. Failures are logged (not left as
      // unhandled rejections); the last good `bundleCode` is kept.
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
            server.ws.send({ type: "custom", event: DATA_APP_REBUILT_EVENT });
          }
        } catch (error) {
          server.config.logger.error(
            `[data-app-dev] failed to build the app bundle: ${
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

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type Plugin, type Rollup, build } from "vite";

// Build-time string constants shared with the rspack config; bundled as values,
// so this references no app runtime code (cf. `use-load-sdk-bundle.ts`). A
// namespace import stays single-line so the disable covers the reported line.
// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import * as dataAppVirtualModules from "build-configs/embedding-sdk/constants/data-app-virtual-modules";

import { DATA_APP_BUNDLE_URL, DATA_APP_REBUILT_EVENT } from "../bundle";
import { dataAppBuildPlugins, dataAppLibBuild } from "../config/build-config";

// Virtual modules the dev server provides. The dev server serves a synthetic
// `index.html` (below) that imports the dev entry; the dev entry imports the
// config (the app's allowed hosts + the bundle URL/event). The dev entry is the
// prebuilt `data-app-dev-entry.js` (bundled by the SDK's browser build, shipped
// next to this bundle in `dist`); it keeps React + `@metabase/embedding-sdk-react`
// external so the consumer's Vite resolves them to its single instance.
const { DATA_APP_DEV_CONFIG_VIRTUAL_ID, DATA_APP_DEV_ENTRY_VIRTUAL_ID } =
  dataAppVirtualModules;

const DEV_ENTRY_SOURCE_PATH = fileURLToPath(
  new URL("data-app-dev-entry.js", import.meta.url),
);

// The dev server's HTML shell, served synthetically so the app scaffold needs no
// `index.html`. It just boots the dev entry (resolved + served as a virtual
// module below), which injects the baseline reset CSS itself (the same file the
// production iframe loads).
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Data App Dev Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import ${JSON.stringify(DATA_APP_DEV_ENTRY_VIRTUAL_ID)};
    </script>
  </body>
</html>
`;

// Rollup/Vite's virtual-module marker: a leading NUL byte tells Rollup core and
// other plugins that an id is synthetic, so they don't try to resolve/load it
// from disk. It's a convention (not a public export), so we spell it out; Vite
// encodes it as `__x00__` in dev URLs.
const RESOLVED_PREFIX = "\0";

/**
 * Makes `npm run dev` run the app through the real Near-Membrane sandbox instead
 * of mounting it un-sandboxed, so dev behaves like production — including for
 * third-party libraries the app bundles.
 *
 * The membrane evaluates a code string, not Vite's module graph, so the app is
 * built in-memory as the production IIFE on server start and on every `src/`
 * change, served at `DATA_APP_BUNDLE_URL`. Instead of a full page reload it emits
 * `DATA_APP_REBUILT_EVENT`, and the dev entry re-evaluates the new bundle in the
 * live sandbox and re-renders in place — preserving the loaded SDK + auth (a
 * soft reload; component state still resets, since the app is an opaque bundle).
 */
export function dataAppSandboxDevPlugin(allowedHosts: string[]): Plugin {
  let bundleCode = "";

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

    bundleCode =
      outputs
        .flatMap((output) => ("output" in output ? output.output : []))
        .find((chunk): chunk is Rollup.OutputChunk => chunk.type === "chunk")
        ?.code ?? "";
  };

  return {
    name: "metabase-data-app-dev",
    apply: "serve",

    resolveId(id) {
      if (
        id === DATA_APP_DEV_ENTRY_VIRTUAL_ID ||
        id === DATA_APP_DEV_CONFIG_VIRTUAL_ID
      ) {
        return RESOLVED_PREFIX + id;
      }
    },

    load(id) {
      if (id === RESOLVED_PREFIX + DATA_APP_DEV_ENTRY_VIRTUAL_ID) {
        return fs.readFileSync(DEV_ENTRY_SOURCE_PATH, "utf8");
      }

      if (id === RESOLVED_PREFIX + DATA_APP_DEV_CONFIG_VIRTUAL_ID) {
        return [
          `export const allowedHosts = ${JSON.stringify(allowedHosts)};`,
          `export const bundleUrl = ${JSON.stringify(DATA_APP_BUNDLE_URL)};`,
          `export const rebuiltEvent = ${JSON.stringify(DATA_APP_REBUILT_EVENT)};`,
        ].join("\n");
      }
    },

    async configureServer(server) {
      const { root, mode } = server.config;

      const safeRebuild = async (): Promise<boolean> => {
        try {
          await rebuild(root, mode);

          return true;
        } catch (error) {
          server.config.logger.error(
            `[data-app-dev] failed to build the app bundle: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );

          return false;
        }
      };

      // Coalesce rebuilds: at most one Vite build runs at a time, and changes
      // that arrive mid-build collapse into a single follow-up — so a burst of
      // saves can't back up a queue of full rebuilds (or fire a soft reload each).
      let building = false;
      let pending = false;
      const rebuildAndNotify = async () => {
        if (building) {
          pending = true;
          return;
        }

        building = true;
        try {
          let built = false;
          do {
            pending = false;
            built = await safeRebuild();
          } while (pending);

          if (built) {
            server.ws.send({ type: "custom", event: DATA_APP_REBUILT_EVENT });
          }
        } finally {
          building = false;
        }
      };

      // Initial build; no client is connected yet, so nothing to notify.
      await safeRebuild();

      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== DATA_APP_BUNDLE_URL) {
          next();

          return;
        }

        if (!bundleCode) {
          res.statusCode = 503;
          res.setHeader("Content-Type", "text/plain");
          res.end("data-app bundle is not built — see the dev server logs.");

          return;
        }

        res.setHeader("Content-Type", "text/javascript");
        res.end(bundleCode);
      });

      const srcDir = `${path.sep}src${path.sep}`;

      server.watcher.on("change", async (file) => {
        if (file.includes(srcDir)) {
          await rebuildAndNotify();
        }
      });

      // Serve the synthetic index.html as a POST middleware (after Vite's
      // transform/asset middlewares) so it only catches navigation requests —
      // the initial load and any deep link / SPA route, not module/asset fetches.
      // `transformIndexHtml` injects the HMR client + resolves the entry import.
      return () => {
        server.middlewares.use(async (req, res, next) => {
          if (
            req.method !== "GET" ||
            !req.headers.accept?.includes("text/html")
          ) {
            next();

            return;
          }

          try {
            const html = await server.transformIndexHtml(
              req.url ?? "/",
              INDEX_HTML,
            );

            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          } catch (error) {
            next(error);
          }
        });
      };
    },
  };
}

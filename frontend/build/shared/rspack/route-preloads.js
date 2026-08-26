/* eslint-env node */
const path = require("path");

const { sources } = require("@rspack/core");

const { preloadRows } = require("./route-preloads-rows");
const { readRoutes } = require("./routes");

const MANIFEST_FILENAME = "route-preloads.json";

// `compiler.context` is the entry's directory, not the checkout.
const REPO_ROOT = path.resolve(__dirname, "../../../..");

/**
 * Paths a signed-out visitor renders, rather than being bounced to the login
 * page. Every other route redirects, so a hint for one would fetch a chunk the
 * visitor never reaches. Setup runs before any user exists, which is exactly
 * when there is no session to check.
 */
const SIGNED_OUT_PATHS = new Set(["/setup"]);

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * A preload hint for one file the page's chunk needs.
 *
 * `preload` rather than `prefetch`, because this is for the navigation in hand:
 * a prefetch is held back until the browser is idle, which is after the load
 * these hints are meant to speed up.
 *
 * `fetchpriority="low"` because the page's chunk is wanted a moment after the
 * app is, not before it. Without it these fetch at the same high priority as the
 * entry scripts and take bandwidth from them, so the shell renders later. Low
 * still starts with the document, which is the point: the alternative is a fetch
 * that cannot begin until the app has parsed and run.
 */
function preloadTag(file) {
  const as = file.endsWith(".css") ? "style" : "script";
  return `<link rel="preload" href="${escapeHtml(file)}" as="${as}" fetchpriority="low">`;
}

/**
 * The files a chunk group needs, its shared chunks included. Files already in
 * the page's own script tags are left out: they are being fetched anyway.
 */
function groupFiles(group, initialFiles) {
  const files = [];
  for (const chunk of group.chunks) {
    for (const file of chunk.files) {
      if (!initialFiles.has(file) && /\.(js|css)$/.test(file)) {
        files.push(file);
      }
    }
  }
  return files;
}

/**
 * Writes `route-preloads.json`: which files the page each URL renders needs.
 *
 * The rows are derived from the route files on every build, so nothing is
 * checked in and nothing can drift. `routes/` reads the tree out of source, and
 * `route-preloads-rows.js` keeps the ones with a chunk and coalesces them.
 *
 * It runs in development too. Deriving the rows is parsing, not building, so it
 * costs about seventy milliseconds, and having the hints in both places means a
 * broken pattern shows up while someone is working on it rather than in
 * production.
 */
class RoutePreloadManifest {
  constructor({ root = REPO_ROOT } = {}) {
    this.root = root;
  }

  apply(/** @type {import("webpack").Compiler} */ compiler) {
    const publicPath = compiler.options.output.publicPath || "";

    compiler.hooks.thisCompilation.tap(
      "RoutePreloadManifest",
      (compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: "RoutePreloadManifest",
            stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
          },
          () => {
            const initialFiles = new Set();
            for (const chunk of compilation.chunks) {
              if (chunk.canBeInitial()) {
                for (const file of chunk.files) {
                  initialFiles.add(file);
                }
              }
            }

            const rows = preloadRows(readRoutes(this.root).routes);

            const missing = [];
            const entries = rows.flatMap((route) => {
              const files = route.chunks.flatMap((name) => {
                const group = compilation.namedChunkGroups.get(name);
                if (!group) {
                  missing.push(name);
                  return [];
                }
                return groupFiles(group, initialFiles);
              });

              // One row per pattern: the markup to write, and whether the page
              // renders for a signed-out visitor. The backend matches and
              // writes what it is given.
              const html = [...new Set(files)]
                .map((file) => preloadTag(publicPath + file))
                .join("");

              return route.patterns.map((pattern) => [
                pattern,
                html,
                SIGNED_OUT_PATHS.has(pattern),
              ]);
            });

            if (missing.length > 0) {
              compilation.errors.push(
                new Error(
                  `route-preloads: no chunk is named ${[...new Set(missing)].join(", ")}. ` +
                    "The route files name it in a `webpackChunkName` comment, " +
                    "so either the comment or the chunk it names has moved.",
                ),
              );
              return;
            }

            // Emitted in table order: the backend takes the first match.
            compilation.emitAsset(
              MANIFEST_FILENAME,
              // Read by `metabase.server.routes.index`, never by a person.
              new sources.RawSource(JSON.stringify(entries)),
            );
          },
        );
      },
    );
  }
}

module.exports = { RoutePreloadManifest, MANIFEST_FILENAME };

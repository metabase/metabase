/* eslint-env node */
const path = require("path");

const { sources } = require("@rspack/core");

const { preloadRows } = require("./route-preloads-rows");
const { readRoutes } = require("./routes");

const MANIFEST_FILENAME = "route-preloads.json";

// `compiler.context` is the entry's directory, not the checkout.
const REPO_ROOT = path.resolve(__dirname, "../../../..");

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
 * Development skips it. The hints only pay for themselves on a real network,
 * and the backend serves the page without them when the manifest is absent.
 */
class RoutePreloadManifest {
  constructor({ enabled = true, root = REPO_ROOT } = {}) {
    this.enabled = enabled;
    this.root = root;
  }

  apply(/** @type {import("webpack").Compiler} */ compiler) {
    if (!this.enabled) {
      return;
    }

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
            const entries = rows.map((route) => {
              const files = route.chunks.flatMap((name) => {
                const group = compilation.namedChunkGroups.get(name);
                if (!group) {
                  missing.push(name);
                  return [];
                }
                return groupFiles(group, initialFiles);
              });

              return {
                patterns: route.patterns,
                files: [...new Set(files)].map((file) => publicPath + file),
              };
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
              new sources.RawSource(JSON.stringify(entries, null, 1)),
            );
          },
        );
      },
    );
  }
}

module.exports = { RoutePreloadManifest, MANIFEST_FILENAME };

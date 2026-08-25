/* eslint-env node */
const { sources } = require("@rspack/core");

const MANIFEST_FILENAME = "route-preloads.json";

/**
 * Which chunk serves which URL, generated from the route tree.
 *
 * A page in its own chunk is only requested once `app-main` has downloaded,
 * parsed and run, so its fetch starts hundreds of milliseconds after the
 * document arrives. The backend reads the manifest this table produces and
 * writes `<link rel="preload">` into the page it serves, which moves that fetch
 * alongside the download of `app-main` instead of after it.
 *
 * `route-preloads.unit.spec.ts` derives this file from the real route tree and
 * fails when it drifts. Regenerate it rather than editing it by hand:
 *
 *   UPDATE_ROUTE_PRELOADS=1 bun run test-unit-keep-cljs route-preloads
 *
 * `patterns` are clout routes, the same matcher the API endpoints use. The
 * backend takes the first row that matches, and the rows are ordered deepest
 * first, so a narrower row shields the wider one it sits inside.
 */
const ROUTE_PRELOADS = require("./route-preloads.generated.json");

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

class RoutePreloadManifest {
  constructor(routes = ROUTE_PRELOADS) {
    this.routes = routes;
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

            const missing = [];
            const entries = this.routes.map((route) => {
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
                    "Regenerate route-preloads.generated.json with " +
                    "UPDATE_ROUTE_PRELOADS=1 bun run test-unit-keep-cljs route-preloads",
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

module.exports = { ROUTE_PRELOADS, RoutePreloadManifest, MANIFEST_FILENAME };

/* eslint-env node */
const { sources } = require("@rspack/core");

const MANIFEST_FILENAME = "route-preloads.json";

/**
 * Which chunk serves which URL.
 *
 * A page in its own chunk is only requested once `app-main` has downloaded,
 * parsed and run, so its fetch starts hundreds of milliseconds after the
 * document arrives. The backend reads the manifest this table produces and
 * writes `<link rel="preload">` into the page it serves, which moves that fetch
 * alongside the download of `app-main` instead of after it.
 *
 * `patterns` are clout routes, the same matcher the API endpoints use. The
 * backend takes the first row that matches, so order matters: a row for a page
 * below another section goes above it.
 *
 * The chunk names come from the `webpackChunkName` comments in the route files.
 * A name that no chunk carries fails the build, and `route-preloads.unit.spec.ts`
 * matches every row against the real route tree, so neither half can drift
 * unnoticed. `example` is a URL the patterns stand for. The test uses it and
 * nothing else does.
 */
const ROUTE_PRELOADS = [
  { patterns: ["/"], example: "/", chunks: ["home"] },
  {
    patterns: ["/question/ask"],
    example: "/question/ask",
    chunks: ["metabot-query-builder"],
  },
  {
    patterns: ["/question", "/question/*"],
    example: "/question",
    chunks: ["query-builder"],
  },
  {
    patterns: ["/model", "/model/*"],
    example: "/model",
    chunks: ["query-builder"],
  },
  {
    patterns: ["/table/*"],
    example: "/table/1/detail/2",
    chunks: ["query-builder", "table-detail"],
  },
  {
    patterns: ["/auto/dashboard/*"],
    example: "/auto/dashboard/table/1",
    chunks: ["automatic-dashboard"],
  },
  {
    patterns: ["/dashboard/*"],
    example: "/dashboard/1",
    chunks: ["dashboard"],
  },
  { patterns: ["/document/*"], example: "/document/1", chunks: ["documents"] },
  {
    patterns: ["/collection/*"],
    example: "/collection/root",
    chunks: ["collection"],
  },
  { patterns: ["/trash"], example: "/trash", chunks: ["trash-collection"] },
  { patterns: ["/browse/*"], example: "/browse/models", chunks: ["browse"] },
  { patterns: ["/search"], example: "/search", chunks: ["search"] },
  {
    patterns: ["/getting-started"],
    example: "/getting-started",
    chunks: ["onboarding"],
  },
  { patterns: ["/setup"], example: "/setup", chunks: ["setup"] },
  { patterns: ["/explore"], example: "/explore", chunks: ["metrics-viewer"] },
  { patterns: ["/metric/*"], example: "/metric/new", chunks: ["metrics"] },
  {
    patterns: ["/admin", "/admin/*"],
    example: "/admin/databases",
    chunks: ["admin"],
  },
  {
    patterns: ["/account", "/account/*"],
    example: "/account/profile",
    chunks: ["account"],
  },
  {
    patterns: ["/reference", "/reference/*"],
    example: "/reference/databases",
    chunks: ["reference"],
  },
];

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
                    "Update the table in frontend/build/shared/rspack/route-preloads.js " +
                    "to match the webpackChunkName comments in the route files.",
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

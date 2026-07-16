const rspack = require("@rspack/core");
const YAML = require("json-to-pretty-yaml");
const { StatsWriterPlugin } = require("webpack-stats-plugin");

const { WEBPACK_BUNDLE } = require("./frontend/build/shared/constants");
const { SVGO_CONFIG } = require("./frontend/build/shared/rspack/svgo-config");

const ASSETS_PATH = __dirname + "/resources/frontend_client/app/assets";
const SRC_PATH = __dirname + "/frontend/src/metabase";
const BUILD_PATH = __dirname + "/resources/frontend_client";
const CLJS_SRC_PATH = __dirname + "/target/cljs_release";
const CLJS_SRC_PATH_DEV = __dirname + "/target/cljs_dev";
const LIB_SRC_PATH = __dirname + "/frontend/src/metabase-lib";
const TYPES_SRC_PATH = __dirname + "/frontend/src/metabase-types";
const EMBEDDING_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding";
const SDK_SHARED_SRC_PATH = __dirname + "/frontend/src/embedding-sdk-shared";
const SDK_BUNDLE_SRC_PATH = __dirname + "/frontend/src/embedding-sdk-bundle";
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";

const devMode = WEBPACK_BUNDLE !== "production";

const SLIM_BUNDLE_NAME = "lib-static-viz-custom";
const SLIM_BUNDLE_ASSET = `${SLIM_BUNDLE_NAME}.bundle.js`;
// The slim bundle exists so the untrusted custom-viz isolate never parses the
// built-in chart stack (ECharts/zrender/visx + the 13 chart components — several
// MB of the full bundle). The budget fails the build if that stack (or another
// big dependency) silently leaks back in.
//
// The current floor is set by the settings/formatting machinery the custom-viz
// SSR path shares with the app (lib/settings plus cljs metabase-lib for MBQL
// normalization). With the #77658 import optimizations now in, this budget can
// likely be tightened substantially — measure a build and lower it.
const SLIM_BUNDLE_MAX_BYTES = 10 * 1024 * 1024;
// Built-in chart machinery that must never enter the slim custom-viz bundle.
const SLIM_BUNDLE_FORBIDDEN_MODULE_RE =
  /node_modules[\\/](echarts|zrender|@visx)[\\/]|static-viz[\\/]register\.ts|StaticVisualization[\\/]StaticVisualization\.tsx|StaticChoropleth/;

class SlimStaticVizGuardPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap("SlimStaticVizGuardPlugin", (compilation) => {
      const asset = compilation.getAsset(SLIM_BUNDLE_ASSET);
      if (!asset) {
        compilation.errors.push(
          new Error(
            `[slim static-viz] expected asset ${SLIM_BUNDLE_ASSET} was not emitted`,
          ),
        );
        return;
      }

      const size = asset.source.size();
      if (size > SLIM_BUNDLE_MAX_BYTES) {
        compilation.errors.push(
          new Error(
            `[slim static-viz] ${SLIM_BUNDLE_ASSET} is ${size} bytes, over its ${SLIM_BUNDLE_MAX_BYTES}-byte budget. ` +
              `This bundle is cold-parsed by the untrusted custom-viz isolate; a size jump usually means ` +
              `the built-in chart stack (ECharts/visx/chart components) leaked back in via a new import.`,
          ),
        );
      }

      // Module-level tripwire: attribute every module (including ones nested in
      // concatenated groups, which inherit their group's chunk membership) to the
      // slim chunk and reject the build if any forbidden module landed in it.
      const { chunks = [], modules = [] } = compilation.getStats().toJson({
        all: false,
        ids: true,
        chunks: true,
        modules: true,
        nestedModules: true,
        modulesSpace: Infinity,
        nestedModulesSpace: Infinity,
      });
      const slimChunkId = chunks.find((chunk) =>
        (chunk.names ?? []).includes(SLIM_BUNDLE_NAME),
      )?.id;
      const leakedModules = [];
      const walk = (moduleList, inheritedMembership) => {
        for (const module of moduleList ?? []) {
          const inSlimChunk = module.chunks
            ? module.chunks.includes(slimChunkId)
            : inheritedMembership;
          const name = module.nameForCondition || module.name || "";
          if (inSlimChunk && SLIM_BUNDLE_FORBIDDEN_MODULE_RE.test(name)) {
            leakedModules.push(name);
          }
          walk(module.modules, inSlimChunk);
        }
      };
      walk(modules, false);
      if (leakedModules.length > 0) {
        compilation.errors.push(
          new Error(
            `[slim static-viz] built-in chart modules leaked into ${SLIM_BUNDLE_ASSET}:\n` +
              leakedModules.slice(0, 20).join("\n"),
          ),
        );
      }
    });
  }
}

module.exports = (env) => {
  return {
    mode: "production",
    context: SRC_PATH,

    performance: {
      // The static-viz bundle runs inside the backend's GraalVM context, so its size is
      // a startup-time and memory cost. Fail the build if it grows past the budget -
      // sudden growth almost always means app code (metabase/ui, api, metabase-lib) leaked in.
      // Dev builds use the unminified cljs_dev output, so the budget only applies to
      // production builds.
      hints: devMode ? false : "error",
      maxAssetSize: 3.5 * 1024 * 1024,
      maxEntrypointSize: 3.5 * 1024 * 1024,
      // The slim custom-viz bundle has its own (larger, for now) budget enforced
      // by SlimStaticVizGuardPlugin below.
      assetFilter: (assetFilename) => assetFilename !== SLIM_BUNDLE_ASSET,
    },

    entry: {
      "lib-static-viz": {
        import: "./app-static-viz.ts",
        library: {
          name: "MetabaseStaticViz",
          type: "var",
        },
      },
      // Slim custom-viz-only bundle for the untrusted plugin isolate. Reuses the
      // `MetabaseStaticViz` global so the Clojure render path calls the same
      // interface either way (each isolate loads exactly one of the two bundles).
      [SLIM_BUNDLE_NAME]: {
        import: "./app-static-viz-custom.ts",
        library: {
          name: "MetabaseStaticViz",
          type: "var",
        },
      },
    },

    output: {
      path: BUILD_PATH + "/app/dist",
      filename: "[name].bundle.js",
      publicPath: "/app/dist",
      globalObject: "globalThis",
    },

    module: {
      rules: [
        {
          test: /\.css$/i,
          use: "null-loader",
        },
        {
          test: /\.(tsx?|jsx?)$/,
          exclude: /node_modules|cljs|css\/core\/fonts\.styled\.ts/,
          use: [
            {
              loader: "builtin:swc-loader",
              options: {
                jsc: {
                  loose: true,
                  transform: {
                    react: {
                      runtime: "automatic",
                      refresh: false,
                    },
                  },
                  parser: {
                    syntax: "typescript",
                    tsx: true,
                  },
                  experimental: {
                    plugins: [["@swc/plugin-emotion", { sourceMap: devMode }]],
                  },
                },

                sourceMaps: false,
                minify: true,
                env: {
                  targets: ["defaults"],
                },
              },
            },
          ],
        },
        {
          test: /\.svg/,
          type: "asset/source",
          resourceQuery: /source/, // *.svg?source
        },
        {
          test: /\.svg$/i,
          issuer: /\.[jt]sx?$/,
          resourceQuery: /component/, // *.svg?component
          use: [
            {
              loader: "@svgr/webpack",
              options: {
                ref: true,
                svgoConfig: SVGO_CONFIG,
              },
            },
          ],
        },
        {
          test: /\.svg$/,
          type: "asset/resource",
          resourceQuery: { not: [/component|source/] },
        },
      ],
    },
    resolve: {
      extensions: [".web.js", ".js", ".jsx", ".ts", ".tsx"],
      alias: {
        assets: ASSETS_PATH,
        metabase: SRC_PATH,
        "metabase-enterprise": ENTERPRISE_SRC_PATH,
        cljs: devMode ? CLJS_SRC_PATH_DEV : CLJS_SRC_PATH,
        "metabase-lib": LIB_SRC_PATH,
        "metabase-types": TYPES_SRC_PATH,
        embedding: EMBEDDING_SRC_PATH,
        "embedding-sdk-bundle": SDK_BUNDLE_SRC_PATH,
        "embedding-sdk-shared": SDK_SHARED_SRC_PATH,
        "process/browser": require.resolve("process/browser"),
        "ee-overrides":
          process.env.MB_EDITION === "ee"
            ? ENTERPRISE_SRC_PATH + "/static-viz-overrides"
            : SRC_PATH + "/utils/noop",
      },
      fallback: {
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/"),
        process: require.resolve("process/browser"),
        querystring: require.resolve("querystring-es3"),
      },
    },
    optimization: {
      minimize: true,
    },
    plugins: [
      new SlimStaticVizGuardPlugin(),
      new rspack.EnvironmentPlugin({
        IS_EMBEDDING_SDK_BUILD: false,
      }),
      new rspack.NormalModuleReplacementPlugin(
        /node_modules\/@reduxjs\/toolkit\/.*\/process$/,
        "process/browser",
      ),
      new rspack.ProvidePlugin({
        process: "process/browser",
        Buffer: ["buffer", "Buffer"],
      }),
      new StatsWriterPlugin({
        stats: {
          modules: true,
          assets: false,
          nestedModules: false,
          reasons: false,
          excludeModules: [/node_modules/],
        },
        filename: "../../../../.github/static-viz-sources.yaml",
        transform: (stats) =>
          YAML.stringify({
            static_viz: stats.modules
              .filter(
                (module) =>
                  module.type !== "hidden modules" &&
                  module.moduleType !== "runtime" &&
                  module.nameForCondition != null,
              )
              .map((module) =>
                module.nameForCondition.replace(`${__dirname}/`, ""),
              ),
          }),
      }),
    ],
  };
};

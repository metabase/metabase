// @ts-check
/* eslint-env node */

const path = require("path");

const rspack = require("@rspack/core");

const { WEBPACK_BUNDLE } = require("../constants");

const { SVGO_CONFIG } = require("./svgo-config");

const ROOT_PATH = path.resolve(__dirname, "../../../..");

const ASSETS_PATH = ROOT_PATH + "/resources/frontend_client/app/assets";
const SRC_PATH = ROOT_PATH + "/frontend/src/metabase";
const BUILD_PATH = ROOT_PATH + "/resources/frontend_client";
const CLJS_SRC_PATH = ROOT_PATH + "/target/cljs_release";
const CLJS_SRC_PATH_DEV = ROOT_PATH + "/target/cljs_dev";
const LIB_SRC_PATH = ROOT_PATH + "/frontend/src/metabase-lib";
const TYPES_SRC_PATH = ROOT_PATH + "/frontend/src/metabase-types";
const EMBEDDING_SRC_PATH = ROOT_PATH + "/enterprise/frontend/src/embedding";
const SDK_SHARED_SRC_PATH = ROOT_PATH + "/frontend/src/embedding-sdk-shared";
const SDK_BUNDLE_SRC_PATH = ROOT_PATH + "/frontend/src/embedding-sdk-bundle";
const ENTERPRISE_SRC_PATH =
  ROOT_PATH + "/enterprise/frontend/src/metabase-enterprise";

const devMode = WEBPACK_BUNDLE !== "production";

/**
 * Shared rspack config for the static-viz bundles. Both bundles expose the same
 * `MetabaseStaticViz` global and run inside a GraalJS context, so they only differ
 * in entry point, size budget, and the extra plugins each one needs.
 *
 * @param {object} options
 * @param {string} options.entryName    Chunk name; also the `[name]` in the output filename.
 * @param {string} options.entryImport  Entry module, relative to `frontend/src/metabase`.
 * @param {number} options.maxAssetSize Size budget in bytes. Enforced only in production
 *                                      builds, since dev builds use unminified cljs output.
 * @param {import("@rspack/core").RspackPluginInstance[]} [options.plugins] Extra plugins.
 */
function createStaticVizConfig({
  entryName,
  entryImport,
  maxAssetSize,
  plugins = [],
}) {
  return {
    mode: "production",
    context: SRC_PATH,

    performance: {
      // The static-viz bundles run inside the backend's GraalVM context, so their size is
      // a startup-time and memory cost. Fail the build if one grows past its budget -
      // sudden growth almost always means app code (metabase/ui, api, metabase-lib) leaked in.
      // Dev builds use the unminified cljs_dev output, so budgets only apply to
      // production builds.
      hints: devMode ? false : "error",
      maxAssetSize,
      maxEntrypointSize: maxAssetSize,
    },

    entry: {
      [entryName]: {
        import: entryImport,
        library: {
          // eslint-disable-next-line metabase/no-literal-metabase-strings
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
      new rspack.EnvironmentPlugin({
        IS_EMBEDDING_SDK_BUILD: JSON.stringify(false),
      }),
      new rspack.NormalModuleReplacementPlugin(
        /node_modules\/@reduxjs\/toolkit\/.*\/process$/,
        "process/browser",
      ),
      new rspack.ProvidePlugin({
        process: "process/browser",
        Buffer: ["buffer", "Buffer"],
      }),
      ...plugins,
    ],
  };
}

module.exports = { createStaticVizConfig, ROOT_PATH };

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

const moduleConfig = {
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
};

const resolveAlias = {
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
};

const resolveExtensions = [".web.js", ".js", ".jsx", ".ts", ".tsx"];

module.exports = (env) => {
  const graalConfig = {
    name: "graal",
    mode: "production",
    context: SRC_PATH,

    performance: {
      hints: false,
    },

    entry: {
      "app-static-viz": {
        import: "./app-static-viz.ts",
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

    module: moduleConfig,
    resolve: {
      extensions: resolveExtensions,
      alias: resolveAlias,
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
              )
              .concat(["frontend/src/metabase/app-static-viz-cli.ts"]),
          }),
      }),
    ],
  };

  const nodeCliConfig = {
    name: "node-cli",
    mode: "production",
    context: SRC_PATH,
    target: "node",

    performance: {
      hints: false,
    },

    entry: {
      "app-static-viz-cli": "./app-static-viz-cli.ts",
    },

    output: {
      path: BUILD_PATH + "/app/dist",
      filename: "[name].bundle.js",
    },

    module: moduleConfig,
    resolve: {
      extensions: resolveExtensions,
      alias: resolveAlias,
    },
    optimization: {
      minimize: true,
    },
    plugins: [
      new rspack.EnvironmentPlugin({
        IS_EMBEDDING_SDK_BUILD: false,
      }),
    ],
  };

  return [graalConfig, nodeCliConfig];
};

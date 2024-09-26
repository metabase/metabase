const YAML = require("json-to-pretty-yaml");
const TerserPlugin = require("terser-webpack-plugin");
const webpack = require("webpack");
const { StatsWriterPlugin } = require("webpack-stats-plugin");

const ASSETS_PATH = __dirname + "/resources/frontend_client/app/assets";
const SRC_PATH = __dirname + "/frontend/src/metabase";
const BUILD_PATH = __dirname + "/resources/frontend_client";
const CLJS_SRC_PATH = __dirname + "/target/cljs_release";
const CLJS_SRC_PATH_DEV = __dirname + "/target/cljs_dev";
const LIB_SRC_PATH = __dirname + "/frontend/src/metabase-lib";
const TYPES_SRC_PATH = __dirname + "/frontend/src/metabase-types";
const SDK_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding-sdk";

const WEBPACK_BUNDLE = process.env.WEBPACK_BUNDLE || "development";
const devMode = WEBPACK_BUNDLE !== "production";

module.exports = env => {
  return {
    mode: "production",
    context: SRC_PATH,

    performance: {
      hints: false,
    },

    entry: {
      "lib-static-viz": {
        import: "./static-viz/index.js",
        library: {
          name: "StaticViz",
          type: "var",
        },
      },
    },

    output: {
      path: BUILD_PATH + "/app/dist",
      filename: "[name].bundle.js",
      publicPath: "/app/dist",
      globalObject: "{}",
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
              loader: "swc-loader",
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

                sourceMaps: true,
                minify: false, // produces same bundle size, but cuts 1s locally
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
      extensions: [".webpack.js", ".web.js", ".js", ".jsx", ".ts", ".tsx"],
      alias: {
        assets: ASSETS_PATH,
        metabase: SRC_PATH,
        cljs: devMode ? CLJS_SRC_PATH_DEV : CLJS_SRC_PATH,
        "metabase-lib": LIB_SRC_PATH,
        "metabase-types": TYPES_SRC_PATH,
        "embedding-sdk": SDK_SRC_PATH,
        "process/browser": require.resolve("process/browser"),
      },
      fallback: {
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/"),
        process: require.resolve("process/browser"),
      },
    },
    optimization: {
      minimize: false,
      minimizer: [
        new TerserPlugin({
          minify: TerserPlugin.swcMinify,
        }),
      ],
    },
    plugins: [
      new webpack.EnvironmentPlugin({
        EMBEDDING_SDK_VERSION: null,
        IS_EMBEDDING_SDK_BUILD: false,
      }),
      new webpack.NormalModuleReplacementPlugin(
        /node_modules\/@reduxjs\/toolkit\/.*\/process$/,
        "process/browser",
      ),
      new webpack.ProvidePlugin({
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
        transform: stats =>
          YAML.stringify({
            static_viz: stats.modules
              .filter(
                module =>
                  module.type !== "hidden modules" &&
                  module.moduleType !== "runtime",
              )
              .map(
                module =>
                  module?.nameForCondition?.replace(`${__dirname}/`, "") ??
                  null,
              ),
          }),
      }),
    ],
  };
};

/* eslint-env node */
/* eslint-disable import/no-commonjs */
/* eslint-disable import/order */
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const webpack = require("webpack");
const BundleAnalyzerPlugin =
  require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

const mainConfig = require("./webpack.config");
const { resolve } = require("path");

process.env.IS_SDK_BUILD = "true";

const SDK_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding-sdk";
const BUILD_PATH = __dirname + "/resources/embedding-sdk";
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";

// default WEBPACK_BUNDLE to development
const WEBPACK_BUNDLE = process.env.WEBPACK_BUNDLE || "development";
const isDevMode = WEBPACK_BUNDLE !== "production";

// TODO: Reuse babel and css configs from webpack.config.js
// Babel:
const BABEL_CONFIG = {
  cacheDirectory: process.env.BABEL_DISABLE_CACHE ? false : ".babel_cache",
};

const CSS_CONFIG = {
  modules: {
    auto: filename =>
      !filename.includes("node_modules") && !filename.includes("vendor.css"),
    localIdentName: isDevMode
      ? "[name]__[local]___[hash:base64:5]"
      : "[hash:base64:5]",
  },
  importLoaders: 1,
};

const shouldAnalyzeBundles = process.env.SHOULD_ANALYZE_BUNDLES === "true";

module.exports = env => {
  const config = {
    ...mainConfig,

    context: SDK_SRC_PATH,

    entry: "./index.ts",

    output: {
      path: BUILD_PATH + "/dist",
      publicPath: "",
      filename: "[name].bundle.js",
      library: {
        type: "commonjs2",
      },
    },

    module: {
      rules: [
        {
          test: /\.(tsx?|jsx?)$/,
          exclude: /node_modules|cljs/,
          use: [{ loader: "babel-loader", options: BABEL_CONFIG }],
        },
        {
          test: /\.(svg|png)$/,
          type: "asset/inline",
          resourceQuery: { not: [/component|source/] },
        },
        {
          test: /\.css$/,
          use: [
            {
              loader: "style-loader",
            },
            { loader: "css-loader", options: CSS_CONFIG },
            { loader: "postcss-loader" },
          ],
        },

        {
          test: /\.js$/,
          exclude: /node_modules/,
          enforce: "pre",
          use: ["source-map-loader"],
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
      ],
    },

    externals: {
      ...mainConfig.externals,
      react: "react",
      "react-dom": "react-dom",
      "react/jsx-runtime": "react/jsx-runtime",
    },

    optimization: !isDevMode
      ? {
          minimizer: [
            new TerserPlugin({
              minify: TerserPlugin.swcMinify,
              parallel: true,
              test: /\.(tsx?|jsx?)($|\?)/i,
            }),
          ],
        }
      : undefined,

    plugins: [
      new webpack.BannerPlugin({
        banner:
          "/*\n* This file is subject to the terms and conditions defined in\n * file 'LICENSE.txt', which is part of this source code package.\n */\n",
      }),
      new NodePolyfillPlugin(), // for crypto, among others
      // https://github.com/remarkjs/remark/discussions/903
      new webpack.ProvidePlugin({
        process: "process/browser.js",
      }),

      new ForkTsCheckerWebpackPlugin({
        async: isDevMode,
        typescript: {
          configFile: resolve(__dirname, "./tsconfig.sdk.json"),
          mode: "write-dts",
          memoryLimit: 4096,
        },
      }),

      shouldAnalyzeBundles &&
        new BundleAnalyzerPlugin({
          analyzerMode: "static",
          reportFilename: BUILD_PATH + "/dist/report.html",
        }),
    ].filter(Boolean),
  };

  config.resolve.alias = {
    ...mainConfig.resolve.alias,
    "ee-plugins": ENTERPRISE_SRC_PATH + "/plugins",
    "ee-overrides": ENTERPRISE_SRC_PATH + "/overrides",
  };

  if (config.cache) {
    config.cache.cacheDirectory = resolve(
      __dirname,
      "node_modules/.cache/",
      "webpack-ee",
    );
  }

  return config;
};

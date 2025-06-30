/* eslint-env node */
/* eslint-disable import/no-commonjs */
/* eslint-disable import/order */
const webpack = require("webpack");
const BundleAnalyzerPlugin =
  require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

const mainConfig = require("./webpack.config");
const { resolve } = require("path");

const SDK_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding-sdk";
const BUILD_PATH = __dirname + "/resources/embedding-sdk";

const skipDTS = process.env.SKIP_DTS === "true";

// default WEBPACK_BUNDLE to development
const WEBPACK_BUNDLE = process.env.WEBPACK_BUNDLE || "development";
const isDevMode = WEBPACK_BUNDLE !== "production";

// TODO: Reuse babel and css configs from webpack.config.js
// Babel:
const BABEL_CONFIG = {
  cacheDirectory: process.env.BABEL_DISABLE_CACHE ? false : ".babel_cache",
};

const shouldAnalyzeBundles = process.env.SHOULD_ANALYZE_BUNDLES === "true";

module.exports = (env) => {
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
          test: /\.js$/,
          exclude: /node_modules/,
          enforce: "pre",
          use: ["source-map-loader"],
        },
      ],
    },

    // Prevent these dependencies from being included in the JavaScript bundle.
    externals: [
      // We intend to support multiple React versions in the SDK,
      // so the SDK itself should not pre-bundle react and react-dom
      "react",
      /^react\//i,
      "react-dom",
      /^react-dom\//i,
    ],

    optimization: {
      // The default `moduleIds: 'named'` setting breaks Cypress tests when `development` mode is enabled,
      // so we use a different value instead
      moduleIds: isDevMode ? "natural" : undefined,

      minimize: !isDevMode,
      minimizer: mainConfig.optimization.minimizer,

      splitChunks: false,
    },

    plugins: [
      new webpack.EnvironmentPlugin({
        EMBEDDING_SDK_BUNDLE_HOST: "",
      }),
      new webpack.optimize.LimitChunkCountPlugin({
        maxChunks: 1,
      }),
      new webpack.BannerPlugin({
        banner:
          "/*\n* This file is subject to the terms and conditions defined in\n * file 'LICENSE.txt', which is part of this source code package.\n */\n",
      }),
      !skipDTS &&
        new ForkTsCheckerWebpackPlugin({
          async: isDevMode,
          typescript: {
            configFile: resolve(__dirname, "./tsconfig.sdk.json"),
            mode: "write-dts",
            memoryLimit: 4096,
          },
        }),
      // we don't want to fail the build on type errors, we have a dedicated type check step for that
      new TypescriptConvertErrorsToWarnings(),
      shouldAnalyzeBundles &&
        new BundleAnalyzerPlugin({
          analyzerMode: "static",
          reportFilename: BUILD_PATH + "/dist/report.html",
        }),
    ].filter(Boolean),
  };

  config.resolve.alias = {
    ...mainConfig.resolve.alias,
  };

  return config;
};

// https://github.com/TypeStrong/fork-ts-checker-webpack-plugin/issues/232#issuecomment-1322651312
class TypescriptConvertErrorsToWarnings {
  apply(compiler) {
    const hooks = ForkTsCheckerWebpackPlugin.getCompilerHooks(compiler);

    hooks.issues.tap("TypeScriptWarnOnlyWebpackPlugin", (issues) =>
      issues.map((issue) => ({ ...issue, severity: "warning" })),
    );
  }
}

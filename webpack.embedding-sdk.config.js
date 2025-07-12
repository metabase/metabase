/* eslint-env node */
/* eslint-disable import/no-commonjs */
/* eslint-disable import/order */
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const webpack = require("webpack");
const BundleAnalyzerPlugin =
  require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

const mainConfig = require("./webpack.config");
const { resolve } = require("path");
const fs = require("fs");
const path = require("path");
const {
  getCssLoader,
} = require("./frontend/build/embedding-sdk/webpack-shared/get-css-loader");
const {
  getAssetLoaders,
} = require("./frontend/build/embedding-sdk/webpack-shared/get-asset-loaders");

const SDK_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding-sdk";
const BUILD_PATH = __dirname + "/resources/embedding-sdk";
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";

const skipDTS = process.env.SKIP_DTS === "true";

// default WEBPACK_BUNDLE to development
const WEBPACK_BUNDLE = process.env.WEBPACK_BUNDLE || "development";
const isDevMode = WEBPACK_BUNDLE !== "production";

const sdkPackageTemplateJson = fs.readFileSync(
  path.resolve(
    path.join(
      __dirname,
      "enterprise/frontend/src/embedding-sdk/package.template.json",
    ),
  ),
  "utf-8",
);
const sdkPackageTemplateJsonContent = JSON.parse(sdkPackageTemplateJson);
const EMBEDDING_SDK_VERSION = sdkPackageTemplateJsonContent.version;

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

        ...getAssetLoaders(),
        getCssLoader({ isDevMode }),

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
      mainConfig.externals,

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
    },

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
      new webpack.EnvironmentPlugin({
        EMBEDDING_SDK_VERSION,
        GIT_BRANCH: require("child_process")
          .execSync("git rev-parse --abbrev-ref HEAD")
          .toString()
          .trim(),
        GIT_COMMIT: require("child_process")
          .execSync("git rev-parse HEAD")
          .toString()
          .trim(),
        // In additional to the SDK env detection, it is used for unreachable code elimination.
        // Bundlers remove unreachable code when the direct `process.env.IS_EMBEDDING_SDK === true` condition is used.
        IS_EMBEDDING_SDK: true,
      }),
      new webpack.DefinePlugin({
        "process.env.BUILD_TIME": webpack.DefinePlugin.runtimeValue(
          () => JSON.stringify(new Date().toISOString()),
          true, // This flag makes it update on each build
        ),
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
    "sdk-ee-plugins": ENTERPRISE_SRC_PATH + "/sdk-plugins",
    "sdk-iframe-embedding-ee-plugins":
      ENTERPRISE_SRC_PATH + "/sdk-iframe-embedding-plugins",
    "ee-overrides": ENTERPRISE_SRC_PATH + "/overrides",

    // Allows importing side effects that applies only to the SDK.
    "sdk-specific-imports": SDK_SRC_PATH + "/lib/sdk-specific-imports.ts",
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

// https://github.com/TypeStrong/fork-ts-checker-webpack-plugin/issues/232#issuecomment-1322651312
class TypescriptConvertErrorsToWarnings {
  apply(compiler) {
    const hooks = ForkTsCheckerWebpackPlugin.getCompilerHooks(compiler);

    hooks.issues.tap("TypeScriptWarnOnlyWebpackPlugin", (issues) =>
      issues.map((issue) => ({ ...issue, severity: "warning" })),
    );
  }
}

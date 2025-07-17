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

const SDK_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding-sdk";

const BUILD_PATH = __dirname + "/resources/frontend_client";
const TMP_BUILD_PATH = path.resolve(BUILD_PATH, "tmp-embed-js");
const OUT_FILE_NAME = "embedding-sdk.js";

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

const CSS_CONFIG = {
  modules: {
    auto: (filename) =>
      !filename.includes("node_modules") && !filename.includes("vendor.css"),
    localIdentName: isDevMode
      ? "[name]__[local]___[hash:base64:5]"
      : "[hash:base64:5]",
  },
  importLoaders: 1,
};

const shouldAnalyzeBundles = process.env.SHOULD_ANALYZE_BUNDLES === "true";

module.exports = (env) => {
  const config = {
    ...mainConfig,

    context: SDK_SRC_PATH,

    entry: "./bundle.ts",

    output: {
      // we must use a different directory than the main rspack config,
      // otherwise the path conflicts and the output bundle will not appear.
      path: TMP_BUILD_PATH,
      publicPath: "",
      filename: OUT_FILE_NAME,
      library: {
        type: "umd",
        // eslint-disable-next-line no-literal-metabase-strings -- build config
        name: "MetabaseEmbeddingSDK",
      },
    },

    devtool: false,

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

    // Prevent these dependencies from being included in the JavaScript bundle.
    externals: {
      react: "React",
      "react-dom": "ReactDOM",
      "react-dom/client": "ReactDOMClient",
      "react-dom/server": "ReactDOMServer",
      "react/jsx-runtime": "ReactJSXRuntime",
    },

    optimization: {
      // The default `moduleIds: 'named'` setting breaks Cypress tests when `development` mode is enabled,
      // so we use a different value instead
      moduleIds: isDevMode ? "natural" : undefined,

      minimize: !isDevMode,
      minimizer: mainConfig.optimization.minimizer,

      splitChunks: false,
    },

    plugins: [
      new webpack.optimize.LimitChunkCountPlugin({
        maxChunks: 1,
      }),
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
        IS_EMBEDDING_SDK: "true",
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
      {
        name: "copy-embedding-sdk-bundle-js-to-app-path",
        apply(compiler) {
          compiler.hooks.afterEmit.tap(
            "copy-embedding-sdk-bundle-js-to-app-path",
            () => {
              const tempPath = path.join(TMP_BUILD_PATH, OUT_FILE_NAME);
              const appPath = path.join(BUILD_PATH, "app/", OUT_FILE_NAME);

              // copy embedding-sdk.js from the temp directory to the resources directory
              fs.mkdirSync(path.dirname(appPath), { recursive: true });
              fs.copyFileSync(tempPath, appPath);

              // cleanup the temp directory to prevent bloat.
              fs.rmSync(TMP_BUILD_PATH, { recursive: true });
            },
          );
        },
      },
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

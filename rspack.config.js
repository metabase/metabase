// @ts-check
/* eslint-env node */
/* eslint-disable import/no-commonjs */
const fs = require("fs");

const rspack = require("@rspack/core");
const ReactRefreshPlugin = require("@rspack/plugin-react-refresh");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const WebpackNotifierPlugin = require("webpack-notifier");

const ASSETS_PATH = __dirname + "/resources/frontend_client/app/assets";
const FONTS_PATH = __dirname + "/resources/frontend_client/app/fonts";
const SRC_PATH = __dirname + "/frontend/src/metabase";
const LIB_SRC_PATH = __dirname + "/frontend/src/metabase-lib";
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";
const EMBEDDING_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding";
const SDK_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding-sdk";
const TYPES_SRC_PATH = __dirname + "/frontend/src/metabase-types";
const CLJS_SRC_PATH = __dirname + "/target/cljs_release";
const CLJS_SRC_PATH_DEV = __dirname + "/target/cljs_dev";
const TEST_SUPPORT_PATH = __dirname + "/frontend/test/__support__";
const BUILD_PATH = __dirname + "/resources/frontend_client";
const E2E_PATH = __dirname + "/e2e";

const PORT = process.env.PORT || 8080;
const WEBPACK_BUNDLE = process.env.WEBPACK_BUNDLE || "development";
const devMode = WEBPACK_BUNDLE !== "production";
const shouldEnableHotRefresh = WEBPACK_BUNDLE === "hot";

// Babel:
const BABEL_CONFIG = {
  cacheDirectory: process.env.BABEL_DISABLE_CACHE ? false : ".babel_cache",
  plugins: ["@emotion"],
};

const BABEL_LOADER = { loader: "babel-loader", options: BABEL_CONFIG };

const SWC_LOADER = {
  loader: "builtin:swc-loader",
  options: {
    jsc: {
      loose: true,
      transform: {
        react: {
          runtime: "automatic",
          refresh: shouldEnableHotRefresh,
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
};

const CSS_CONFIG = {
  modules: {
    auto: (filename) =>
      !filename.includes("node_modules") && !filename.includes("vendor.css"),
    localIdentName: devMode
      ? "[name]__[local]___[hash:base64:5]"
      : "[hash:base64:5]",
  },
  importLoaders: 1,
};

class OnScriptError {
  apply(compiler) {
    compiler.hooks.compilation.tap("OnScriptError", (compilation) => {
      HtmlWebpackPlugin.getHooks(compilation).alterAssetTags.tapAsync(
        "OnScriptError",
        (data, cb) => {
          // Manipulate the content
          data.assetTags.scripts.forEach((script) => {
            script.attributes.onerror = `Metabase.AssetErrorLoad(this)`;
          });
          // Tell webpack to move on
          cb(null, data);
        },
      );
    });
  }
}

/** @type {import('@rspack/cli').Configuration} */
const config = {
  mode: devMode ? "development" : "production",
  context: SRC_PATH,

  // output a bundle for the app JS and a bundle for styles
  // eventually we should have multiple (single file) entry points for various pieces of the app to enable code splitting
  entry: {
    "app-main": "./app-main.js",
    "app-public": "./app-public.js",
    "app-embed": "./app-embed.js",
    "app-embed-sdk": "./app-embed-sdk.tsx",
    "vendor-styles": "./css/vendor.css",
    styles: "./css/index.module.css",
  },

  // we override it for dev mode below
  devtool: "source-map",

  externals: {
    canvg: "canvg",
    dompurify: "dompurify",
  },

  // output to "dist"
  output: {
    path: BUILD_PATH + "/app/dist",
    // for production, dev mode is overridden below
    filename: "[name].[contenthash].js",
    publicPath: "app/dist/",
    hashFunction: "xxhash64",
    clean: !devMode,
  },

  module: {
    rules: [
      {
        // swc breaks styles for the whole app if we process this file
        test: /css\/core\/fonts\.styled\.ts$/,
        exclude: /node_modules|cljs/,
        use: [BABEL_LOADER],
      },
      {
        test: /\.(tsx?|jsx?)$/,
        exclude: /node_modules|cljs|css\/core\/fonts\.styled\.ts/,
        use: [SWC_LOADER],
        type: "javascript/auto",
      },
      {
        test: /\.(svg|png)$/,
        type: "asset/resource",
        resourceQuery: { not: [/component|source/] },
      },
      {
        test: /\.css$/,
        use: [
          {
            loader: rspack.CssExtractRspackPlugin.loader,
            options: {
              publicPath: "./",
            },
          },
          { loader: "css-loader", options: CSS_CONFIG },
          { loader: "postcss-loader" },
        ],
        type: "javascript/auto",
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
  resolve: {
    extensions: [
      ".webpack.js",
      ".web.js",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".css",
      ".svg",
    ],
    alias: {
      assets: ASSETS_PATH,
      fonts: FONTS_PATH,
      metabase: SRC_PATH,
      "metabase-lib": LIB_SRC_PATH,
      "metabase-enterprise": ENTERPRISE_SRC_PATH,
      "metabase-types": TYPES_SRC_PATH,
      "metabase-dev": `${SRC_PATH}/dev${devMode ? "" : "-noop"}.js`,
      cljs: devMode ? CLJS_SRC_PATH_DEV : CLJS_SRC_PATH,
      __support__: TEST_SUPPORT_PATH,
      e2e: E2E_PATH,
      style: SRC_PATH + "/css/core/index",
      // NOTE @kdoh - 7/24/18
      // icepick 2.x is es6 by defalt, to maintain backwards compatability
      // with ie11 point to the minified version
      icepick: __dirname + "/node_modules/icepick/icepick.min",
      // conditionally load either the EE plugins file or a empty file in the CE code tree
      "ee-plugins":
        process.env.MB_EDITION === "ee"
          ? ENTERPRISE_SRC_PATH + "/plugins"
          : SRC_PATH + "/lib/noop",
      "ee-overrides":
        process.env.MB_EDITION === "ee"
          ? ENTERPRISE_SRC_PATH + "/overrides"
          : SRC_PATH + "/lib/noop",
      embedding: EMBEDDING_SRC_PATH,
      "embedding-sdk": SDK_SRC_PATH,
      "sdk-iframe-embedding-ee-plugins":
        process.env.MB_EDITION === "ee"
          ? ENTERPRISE_SRC_PATH + "/sdk-iframe-embedding-plugins"
          : SRC_PATH + "/lib/noop",
      "sdk-ee-plugins":
        process.env.MB_EDITION === "ee"
          ? ENTERPRISE_SRC_PATH + "/sdk-plugins"
          : SRC_PATH + "/lib/noop",
      "sdk-specific-imports": SRC_PATH + "/lib/noop",
    },
  },
  optimization: {
    runtimeChunk: "single",
    splitChunks: {
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/](?!(sql-formatter|jspdf|html2canvas-pro)[\\/])/,
          chunks: "all",
          name: "vendor",
        },
        sqlFormatter: {
          test: /[\\/]node_modules[\\/]sql-formatter[\\/]/,
          chunks: "all",
          name: "sql-formatter",
        },
        jspdf: {
          test: /[\\/]node_modules[\\/]jspdf[\\/]/,
          chunks: "all",
          name: "jspdf",
        },
        html2canvas: {
          test: /[\\/]node_modules[\\/]html2canvas-pro[\\/]/,
          chunks: "all",
          name: "html2canvas",
        },
      },
    },
    minimizer: [new rspack.SwcJsMinimizerRspackPlugin()],
  },

  plugins: [
    // Extracts initial CSS into a standard stylesheet that can be loaded in parallel with JavaScript
    new rspack.CssExtractRspackPlugin({
      filename: devMode ? "[name].css" : "[name].[contenthash].css",
      chunkFilename: devMode ? "[id].css" : "[id].[contenthash].css",

      // We use CSS modules to scope styles, so this is safe to ignore according to the docs:
      // https://webpack.js.org/plugins/mini-css-extract-plugin/#remove-order-warnings
      // This is needed due to app-embed-sdk importing the sdk, so the style order is different than the main app.
      ignoreOrder: true,
    }),
    new OnScriptError(),
    new HtmlWebpackPlugin({
      filename: "../../index.html",
      chunksSortMode: "manual",
      chunks: ["vendor", "vendor-styles", "styles", "app-main"],
      template: __dirname + "/resources/frontend_client/index_template.html",
    }),
    new HtmlWebpackPlugin({
      filename: "../../public.html",
      chunksSortMode: "manual",
      chunks: ["vendor", "vendor-styles", "styles", "app-public"],
      template: __dirname + "/resources/frontend_client/index_template.html",
    }),
    new HtmlWebpackPlugin({
      filename: "../../embed.html",
      chunksSortMode: "manual",
      chunks: ["vendor", "vendor-styles", "styles", "app-embed"],
      template: __dirname + "/resources/frontend_client/index_template.html",
    }),
    new HtmlWebpackPlugin({
      filename: "../../embed-sdk.html",
      chunksSortMode: "manual",
      chunks: ["vendor", "vendor-styles", "styles", "app-embed-sdk"],
      template: __dirname + "/resources/frontend_client/index_template.html",
    }),
    new rspack.BannerPlugin({
      banner:
        "/*\n* This file is subject to the terms and conditions defined in\n * file 'LICENSE.txt', which is part of this source code package.\n */\n",
    }),
    new NodePolyfillPlugin(), // for crypto, among others
    new rspack.EnvironmentPlugin({
      WEBPACK_BUNDLE: "development",
      MB_LOG_ANALYTICS: "false",
      ENABLE_CLJS_HOT_RELOAD: process.env.ENABLE_CLJS_HOT_RELOAD ?? "false",
    }),
    // https://github.com/remarkjs/remark/discussions/903
    new rspack.ProvidePlugin({ process: "process/browser.js" }),
  ],
};

if (shouldEnableHotRefresh) {
  config.target = "web";

  if (!config.output || !config.plugins) {
    throw new Error("webpack config is missing configuration");
  }

  // suffixing with ".hot" allows us to run both `yarn run build-hot` and `yarn run test` or `yarn run test-watch` simultaneously
  config.output.filename = "[name].hot.bundle.js";

  // point the publicPath (inlined in index.html by HtmlWebpackPlugin) to the hot-reloading server
  config.output.publicPath =
    `http://localhost:${PORT}/` + config.output.publicPath;

  config.devServer = {
    port: PORT, // make the port explicit so it errors if it's already in use
    hot: true,
    client: {
      progress: false,
      overlay: false,
    },
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    // tweak stats to make the output in the console more legible
    devMiddleware: {
      stats: { preset: "errors-warnings", timings: true },
      writeToDisk: true,
      // if webpack doesn't reload UI after code change in development
      // watchOptions: {
      //     aggregateTimeout: 300,
      //     poll: 1000
      // }
      // if you want to reduce stats noise
      // stats: 'minimal' // values: none, errors-only, minimal, normal, verbose
    },
    host: "0.0.0.0",
  };

  config.watchOptions = {
    // Shadow's live reload does not work. I assume it could be related to rspack migration.  Namely, the compiled cljs
    // is loaded on save. On page reload however, the compiled cljs that was used on rspack initialization is used
    // again. The following exception fixes that, for the cost of always reloading the page when compiled cljs changes.
    ignored: ["**/node_modules" /*, CLJS_SRC_PATH_DEV + "/**" */],
  };

  config.plugins.unshift(
    new ReactRefreshPlugin({
      overlay: false,
    }),
  );
}

if (devMode) {
  if (!config.output || !config.resolve || !config.plugins) {
    throw new Error("webpack config is missing configuration");
  }

  // replace minified files with un-minified versions
  for (const name in config.resolve.alias) {
    const minified = config.resolve.alias[name];
    const unminified = minified.replace(/[.-\/]min\b/g, "");
    if (minified !== unminified && fs.existsSync(unminified)) {
      config.resolve.alias[name] = unminified;
    }
  }

  // by default enable "cheap" source maps for fast re-build speed
  // with BETTER_SOURCE_MAPS we switch to sourcemaps that work with breakpoints and makes stacktraces readable
  config.devtool = process.env.BETTER_SOURCE_MAPS
    ? "eval-source-map"
    : "cheap-module-source-map";

  // helps with source maps
  config.output.devtoolModuleFilenameTemplate = "[absolute-resource-path]";

  config.plugins.push(
    new WebpackNotifierPlugin({
      excludeWarnings: true,
      skipFirstNotification: true,
    }),
  );
}

const additionalRspackConfig = [];

if (process.env.MB_EDITION === "ee") {
  // Build the embed.js script for the sdk iframe embedding.
  additionalRspackConfig.push(require("./rspack.iframe-sdk-embed.config"));
}

module.exports = [config, ...additionalRspackConfig];

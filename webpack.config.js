// @ts-check
/* eslint-env node */
/* eslint-disable import/no-commonjs */
const fs = require("fs");

const ReactRefreshPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");
const webpack = require("webpack");
const WebpackNotifierPlugin = require("webpack-notifier");

const ASSETS_PATH = __dirname + "/resources/frontend_client/app/assets";
const FONTS_PATH = __dirname + "/resources/frontend_client/app/fonts";
const SRC_PATH = __dirname + "/frontend/src/metabase";
const LIB_SRC_PATH = __dirname + "/frontend/src/metabase-lib";
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";
const SDK_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding-sdk";
const TYPES_SRC_PATH = __dirname + "/frontend/src/metabase-types";
const CLJS_SRC_PATH = __dirname + "/target/cljs_release";
const CLJS_SRC_PATH_DEV = __dirname + "/target/cljs_dev";
const TEST_SUPPORT_PATH = __dirname + "/frontend/test/__support__";
const BUILD_PATH = __dirname + "/resources/frontend_client";
const E2E_PATH = __dirname + "/e2e";

// default WEBPACK_BUNDLE to development
const WEBPACK_BUNDLE = process.env.WEBPACK_BUNDLE || "development";
const devMode = WEBPACK_BUNDLE !== "production";
const useFilesystemCache = process.env.FS_CACHE === "true";
const edition = process.env.MB_EDITION || "oss";
const shouldEnableHotRefresh = WEBPACK_BUNDLE === "hot";

// Babel:
const BABEL_CONFIG = {
  cacheDirectory: process.env.BABEL_DISABLE_CACHE ? false : ".babel_cache",
  plugins: ["@emotion"],
};

const BABEL_LOADER = { loader: "babel-loader", options: BABEL_CONFIG };

const SWC_LOADER = {
  loader: "swc-loader",
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
    auto: filename =>
      !filename.includes("node_modules") && !filename.includes("vendor.css"),
    localIdentName: devMode
      ? "[name]__[local]___[hash:base64:5]"
      : "[hash:base64:5]",
  },
  importLoaders: 1,
};

class OnScriptError {
  apply(compiler) {
    compiler.hooks.compilation.tap("OnScriptError", compilation => {
      HtmlWebpackPlugin.getHooks(compilation).alterAssetTags.tapAsync(
        "OnScriptError",
        (data, cb) => {
          // Manipulate the content
          data.assetTags.scripts.forEach(script => {
            script.attributes.onerror = `Metabase.AssetErrorLoad(this)`;
          });
          // Tell webpack to move on
          cb(null, data);
        },
      );
    });
  }
}

/** @type {import('webpack').Configuration} */
const config = {
  mode: devMode ? "development" : "production",
  context: SRC_PATH,

  // output a bundle for the app JS and a bundle for styles
  // eventually we should have multiple (single file) entry points for various pieces of the app to enable code splitting
  entry: {
    "app-main": "./app-main.js",
    "app-public": "./app-public.js",
    "app-embed": "./app-embed.js",
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
    hashFunction: "sha256",
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
            loader: MiniCssExtractPlugin.loader,
            options: {
              publicPath: "./",
            },
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
      ace: __dirname + "/node_modules/ace-builds/src-noconflict",
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
      "embedding-sdk": SDK_SRC_PATH,
    },
  },
  cache: useFilesystemCache
    ? {
        type: "filesystem",
        cacheDirectory: path.resolve(
          __dirname,
          "node_modules/.cache/",
          edition === "oss" ? "webpack-oss" : "webpack-ee",
        ),
        buildDependencies: {
          // invalidates the cache on configuration change
          config: [__filename],
        },
      }
    : undefined,
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
    minimizer: [
      new TerserPlugin({
        minify: TerserPlugin.swcMinify,
        parallel: true,
        test: /\.(tsx?|jsx?)($|\?)/i,
      }),
    ],
  },

  plugins: [
    // Extracts initial CSS into a standard stylesheet that can be loaded in parallel with JavaScript
    new MiniCssExtractPlugin({
      filename: devMode ? "[name].css" : "[name].[contenthash].css",
      chunkFilename: devMode ? "[id].css" : "[id].[contenthash].css",
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
    new webpack.BannerPlugin({
      banner:
        "/*\n* This file is subject to the terms and conditions defined in\n * file 'LICENSE.txt', which is part of this source code package.\n */\n",
    }),
    new NodePolyfillPlugin(), // for crypto, among others
    new webpack.EnvironmentPlugin({
      WEBPACK_BUNDLE: "development",
      MB_LOG_ANALYTICS: "false",
    }),
    // https://github.com/remarkjs/remark/discussions/903
    new webpack.ProvidePlugin({ process: "process/browser.js" }),
    // https://github.com/metabase/metabase/issues/35374
    new webpack.NormalModuleReplacementPlugin(
      /.\/use-popover.js/,
      `${SRC_PATH}/ui/components/overlays/Popover/use-popover`,
    ),
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
    "http://localhost:8080/" + config.output.publicPath;

  config.devServer = {
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
      stats: "errors-warnings",
      writeToDisk: true,
      // if webpack doesn't reload UI after code change in development
      // watchOptions: {
      //     aggregateTimeout: 300,
      //     poll: 1000
      // }
      // if you want to reduce stats noise
      // stats: 'minimal' // values: none, errors-only, minimal, normal, verbose
    },
  };

  config.watchOptions = {
    ignored: ["**/node_modules", CLJS_SRC_PATH_DEV + "/**"],
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

module.exports = config;

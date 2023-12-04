/* eslint-env node */
/* eslint-disable import/no-commonjs */
/* eslint-disable import/order */
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

const webpack = require("webpack");

const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const WebpackNotifierPlugin = require("webpack-notifier");
const ReactRefreshPlugin = require("@pmmmwh/react-refresh-webpack-plugin");

const fs = require("fs");

const ASSETS_PATH = __dirname + "/resources/frontend_client/app/assets";
const FONTS_PATH = __dirname + "/resources/frontend_client/app/fonts";
const SRC_PATH = __dirname + "/frontend/src/metabase";
const LIB_SRC_PATH = __dirname + "/frontend/src/metabase-lib";
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";
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
const shouldUseEslint =
  process.env.WEBPACK_BUNDLE !== "production" &&
  process.env.USE_ESLINT === "true";

// Babel:
const BABEL_CONFIG = {
  cacheDirectory: process.env.BABEL_DISABLE_CACHE ? false : ".babel_cache",
};

const CSS_CONFIG = {
  localIdentName: devMode
    ? "[name]__[local]___[hash:base64:5]"
    : "[hash:base64:5]",
  importLoaders: 1,
};

const config = (module.exports = {
  mode: devMode ? "development" : "production",
  context: SRC_PATH,

  // output a bundle for the app JS and a bundle for styles
  // eventually we should have multiple (single file) entry points for various pieces of the app to enable code splitting
  entry: {
    "app-main": "./app-main.js",
    "app-public": "./app-public.js",
    "app-embed": "./app-embed.js",
    styles: "./css/index.css",
  },

  externals: {
    canvg: "canvg",
    dompurify: "dompurify",
  },

  // output to "dist"
  output: {
    path: BUILD_PATH + "/app/dist",
    filename: "[name].[contenthash].js",
    publicPath: "app/dist/",
    hashFunction: "sha256",
  },

  module: {
    rules: [
      {
        test: /\.(tsx?|jsx?)$/,
        exclude: /node_modules|cljs/,
        use: [{ loader: "babel-loader", options: BABEL_CONFIG }],
      },
      ...(shouldUseEslint
        ? [
            {
              test: /\.(tsx?|jsx?)$/,
              exclude: /node_modules|cljs|\.spec\.js/,
              use: [
                {
                  loader: "eslint-loader",
                  options: {
                    rulePaths: [__dirname + "/frontend/lint/eslint-rules"],
                  },
                },
              ],
            },
          ]
        : []),
      {
        test: /\.(eot|woff2?|ttf|svg|png)$/,
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
    },
  },
  cache: useFilesystemCache
    ? {
        type: "filesystem",
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
          test: /[\\/]node_modules[\\/]/,
          chunks: "all",
          name: "vendor",
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
    new HtmlWebpackPlugin({
      filename: "../../index.html",
      chunksSortMode: "manual",
      chunks: ["vendor", "styles", "app-main"],
      template: __dirname + "/resources/frontend_client/index_template.html",
    }),
    new HtmlWebpackPlugin({
      filename: "../../public.html",
      chunksSortMode: "manual",
      chunks: ["vendor", "styles", "app-public"],
      template: __dirname + "/resources/frontend_client/index_template.html",
    }),
    new HtmlWebpackPlugin({
      filename: "../../embed.html",
      chunksSortMode: "manual",
      chunks: ["vendor", "styles", "app-embed"],
      template: __dirname + "/resources/frontend_client/index_template.html",
    }),
    new webpack.BannerPlugin({
      banner:
        "/*\n* This file is subject to the terms and conditions defined in\n * file 'LICENSE.txt', which is part of this source code package.\n */\n",
    }),
    new NodePolyfillPlugin(), // for crypto, among others
    new webpack.EnvironmentPlugin({
      WEBPACK_BUNDLE: "development",
    }),
    // https://github.com/remarkjs/remark/discussions/903
    new webpack.ProvidePlugin({ process: "process/browser.js" }),
  ],
});

if (WEBPACK_BUNDLE === "hot") {
  config.target = "web";
  // suffixing with ".hot" allows us to run both `yarn run build-hot` and `yarn run test` or `yarn run test-watch` simultaneously
  config.output.filename = "[name].hot.bundle.js?[contenthash]";

  // point the publicPath (inlined in index.html by HtmlWebpackPlugin) to the hot-reloading server
  config.output.publicPath =
    "http://localhost:8080/" + config.output.publicPath;

  config.module.rules.unshift({
    test: /\.(tsx?|jsx?)$/,
    exclude: /node_modules|cljs/,
    use: [
      {
        loader: "babel-loader",
        options: {
          ...BABEL_CONFIG,
          plugins: ["@emotion", "react-refresh/babel"],
        },
      },
    ],
  });

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
    // TODO - once we update webpack to v4+ we can just use `errors-warnings` preset
    devMiddleware: {
      stats: {
        assets: false,
        cached: false,
        cachedAssets: false,
        chunks: false,
        chunkModules: false,
        chunkOrigins: false,
        modules: false,
        color: true,
        hash: false,
        warnings: true,
        errorDetails: false,
      },
      writeToDisk: true,
    },
    // if webpack doesn't reload UI after code change in development
    // watchOptions: {
    //     aggregateTimeout: 300,
    //     poll: 1000
    // }
    // if you want to reduce stats noise
    // stats: 'minimal' // values: none, errors-only, minimal, normal, verbose
  };

  config.watchOptions = {
    ignored: [CLJS_SRC_PATH_DEV + "/**"],
  };

  config.plugins.unshift(
    new webpack.NoEmitOnErrorsPlugin(),
    new ReactRefreshPlugin({
      overlay: false,
    }),
  );
}

if (WEBPACK_BUNDLE !== "production") {
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
  config.output.pathinfo = true;

  config.plugins.push(
    new WebpackNotifierPlugin({
      excludeWarnings: true,
      skipFirstNotification: true,
    }),
  );
} else {
  config.devtool = "source-map";
}

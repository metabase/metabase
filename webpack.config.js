/* eslint-env node */
/* eslint-disable import/no-commonjs */
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

const webpack = require("webpack");

const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const HtmlWebpackHarddiskPlugin = require("html-webpack-harddisk-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const WebpackNotifierPlugin = require("webpack-notifier");

const fs = require("fs");

const ASSETS_PATH = __dirname + "/resources/frontend_client/app/assets";
const FONTS_PATH = __dirname + "/resources/frontend_client/app/fonts";
const SRC_PATH = __dirname + "/frontend/src/metabase";
const LIB_SRC_PATH = __dirname + "/frontend/src/metabase-lib";
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";
const TYPES_SRC_PATH = __dirname + "/frontend/src/metabase-types";
const CLJS_SRC_PATH = __dirname + "/frontend/src/cljs";
const TEST_SUPPORT_PATH = __dirname + "/frontend/test/__support__";
const BUILD_PATH = __dirname + "/resources/frontend_client";

// default NODE_ENV to development
const NODE_ENV = process.env.NODE_ENV || "development";
const devMode = NODE_ENV !== "production";

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

  // output to "dist"
  output: {
    path: BUILD_PATH + "/app/dist",
    // NOTE: the filename on disk won't include "?[chunkhash]" but the URL in index.html generated by HtmlWebpackPlugin will:
    filename: "[name].bundle.js?[chunkhash]",
    publicPath: "app/dist/",
  },

  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules|cljs/,
        use: [{ loader: "babel-loader", options: BABEL_CONFIG }],
      },
      {
        test: /\.(js|jsx)$/,
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
      {
        test: /\.(eot|woff2?|ttf|svg|png)$/,
        type: "asset/resource",
      },
      {
        test: /\.css$/,
        use: [
          devMode
            ? "style-loader"
            : {
                loader: MiniCssExtractPlugin.loader,
                options: {
                  publicPath: "./",
                },
              },
          { loader: "css-loader", options: CSS_CONFIG },
          { loader: "postcss-loader" },
        ],
      },
    ],
  },
  resolve: {
    extensions: [".webpack.js", ".web.js", ".js", ".jsx", ".css", ".svg"],
    alias: {
      assets: ASSETS_PATH,
      fonts: FONTS_PATH,
      metabase: SRC_PATH,
      "metabase-lib": LIB_SRC_PATH,
      "metabase-enterprise": ENTERPRISE_SRC_PATH,
      "metabase-types": TYPES_SRC_PATH,
      cljs: CLJS_SRC_PATH,
      __support__: TEST_SUPPORT_PATH,
      style: SRC_PATH + "/css/core/index",
      ace: __dirname + "/node_modules/ace-builds/src-min-noconflict",
      // NOTE @kdoh - 7/24/18
      // icepick 2.x is es6 by defalt, to maintain backwards compatability
      // with ie11 point to the minified version
      icepick: __dirname + "/node_modules/icepick/icepick.min",
      // conditionally load either the EE plugins file or a empty file in the CE code tree
      "ee-plugins":
        process.env.MB_EDITION === "ee"
          ? ENTERPRISE_SRC_PATH + "/plugins"
          : SRC_PATH + "/lib/noop",
    },
  },

  optimization: {
    splitChunks: {
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          chunks: "all",
          name: "vendor",
        },
      },
    },
  },

  plugins: [
    // Extracts initial CSS into a standard stylesheet that can be loaded in parallel with JavaScript
    // NOTE: the filename on disk won't include "?[chunkhash]" but the URL in index.html generated by HtmlWebpackPlugin will:
    new MiniCssExtractPlugin({
      filename: devMode ? "[name].css" : "[name].css?[contenthash]",
      chunkFilename: devMode ? "[id].css" : "[id].css?[contenthash]",
    }),
    new HtmlWebpackPlugin({
      filename: "../../index.html",
      chunksSortMode: "manual",
      chunks: ["vendor", "styles", "app-main"],
      template: __dirname + "/resources/frontend_client/index_template.html",
      inject: "head",
      // Using default of "defer" creates race-condition when applying whitelabel colors (metabase#18173)
      scriptLoading: "blocking",
      alwaysWriteToDisk: true,
    }),
    new HtmlWebpackPlugin({
      filename: "../../public.html",
      chunksSortMode: "manual",
      chunks: ["vendor", "styles", "app-public"],
      template: __dirname + "/resources/frontend_client/index_template.html",
      inject: "head",
      scriptLoading: "blocking",
      alwaysWriteToDisk: true,
    }),
    new HtmlWebpackPlugin({
      filename: "../../embed.html",
      chunksSortMode: "manual",
      chunks: ["vendor", "styles", "app-embed"],
      template: __dirname + "/resources/frontend_client/index_template.html",
      inject: "head",
      scriptLoading: "blocking",
      alwaysWriteToDisk: true,
    }),
    new HtmlWebpackHarddiskPlugin({
      outputPath: __dirname + "/resources/frontend_client/app/dist",
    }),
    new webpack.BannerPlugin({
      banner:
        "/*\n* This file is subject to the terms and conditions defined in\n * file 'LICENSE.txt', which is part of this source code package.\n */\n",
    }),
    new NodePolyfillPlugin(), // for crypto, among others
  ],
});

if (NODE_ENV === "hot") {
  config.target = "web";
  // suffixing with ".hot" allows us to run both `yarn run build-hot` and `yarn run test` or `yarn run test-watch` simultaneously
  config.output.filename = "[name].hot.bundle.js?[contenthash]";

  // point the publicPath (inlined in index.html by HtmlWebpackPlugin) to the hot-reloading server
  config.output.publicPath =
    "http://localhost:8080/" + config.output.publicPath;

  config.module.rules.unshift({
    test: /\.jsx$/,
    // NOTE: our verison of react-hot-loader doesn't play nice with react-dnd's DragLayer, so we exclude files named `*DragLayer.jsx`
    exclude: /node_modules|cljs|DragLayer\.jsx$/,
    use: [
      // NOTE Atte Keinänen 10/19/17: We are currently sticking to an old version of react-hot-loader
      // because newer versions would require us to upgrade to react-router v4 and possibly deal with
      // asynchronous route issues as well. See https://github.com/gaearon/react-hot-loader/issues/249
      { loader: "react-hot-loader/webpack" },
      { loader: "babel-loader", options: BABEL_CONFIG },
    ],
  });

  config.devServer = {
    hot: true,
    inline: true,
    contentBase: "frontend",
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    // tweak stats to make the output in the console more legible
    // TODO - once we update webpack to v4+ we can just use `errors-warnings` preset
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
      errorDetals: false,
    },
    // if webpack doesn't reload UI after code change in development
    // watchOptions: {
    //     aggregateTimeout: 300,
    //     poll: 1000
    // }
    // if you want to reduce stats noise
    // stats: 'minimal' // values: none, errors-only, minimal, normal, verbose
  };

  config.plugins.unshift(
    new webpack.NoEmitOnErrorsPlugin(),
    new webpack.HotModuleReplacementPlugin(),
  );
}

if (NODE_ENV !== "production") {
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
    ? "inline-source-map"
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

  // Don't bother with ESLint for CI/production (we catch linting errors with another CI run)
  config.module.rules = config.module.rules.filter(rule => {
    return Array.isArray(rule.use) ? rule.use[0].loader != "eslint-loader" : true
  });

  config.plugins.push(
    new TerserPlugin({ parallel: true, test: /\.jsx?($|\?)/i }),
  );

  config.devtool = "source-map";
}

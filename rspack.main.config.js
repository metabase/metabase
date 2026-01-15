// @ts-check
/* eslint-env node */
/* eslint-disable import/no-commonjs */
const fs = require("fs");

const rspack = require("@rspack/core");
const ReactRefreshPlugin = require("@rspack/plugin-react-refresh");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const WebpackNotifierPlugin = require("webpack-notifier");

const {
  IS_DEV_MODE,
  LICENSE_TEXT,
  WEBPACK_BUNDLE,
} = require("./frontend/build/shared/constants");
const { BABEL_CONFIG } = require("./frontend/build/shared/rspack/babel-config");
const { CSS_CONFIG } = require("./frontend/build/shared/rspack/css-config");
const {
  getBannerOptions,
} = require("./frontend/build/shared/rspack/get-banner-options");
const {
  RESOLVE_ALIASES,
} = require("./frontend/build/shared/rspack/resolve-aliases");
const { SVGO_CONFIG } = require("./frontend/build/shared/rspack/svgo-config");

const SRC_PATH = __dirname + "/frontend/src/metabase";
const BUILD_PATH = __dirname + "/resources/frontend_client";

const PORT = process.env.MB_FRONTEND_DEV_PORT || 8080;
const isDevMode = IS_DEV_MODE;
const shouldEnableHotRefresh = WEBPACK_BUNDLE === "hot";

// If you want to test metabase locally with a custom domain, either use
// `metabase.localhost` (anything .localhost should work out of the box) or add
// your custom domain via the `MB_TEST_CUSTOM_DOMAINS` environment variable so
// that rspack will allow requests from them.
const TEST_CUSTOM_DOMAINS =
  process.env.MB_TEST_CUSTOM_DOMAINS?.split(",")
    .map((domain) => domain.trim())
    .filter(Boolean) ?? [];

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
        plugins: [["@swc/plugin-emotion", { sourceMap: isDevMode }]],
      },
    },

    sourceMaps: true,
    minify: false, // produces same bundle size, but cuts 1s locally
    env: {
      targets: ["defaults"],
    },
  },
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
  mode: isDevMode ? "development" : "production",
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
    clean: !isDevMode,
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
            options: { publicPath: "./" },
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
        test: /\.md/,
        type: "asset/source",
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
    alias: RESOLVE_ALIASES,
    fallback: {
      buffer: require.resolve("buffer/"),
      url: require.resolve("url/"),
      events: require.resolve("events/"),
      querystring: require.resolve("querystring-es3"),
    },
  },
  optimization: {
    runtimeChunk: "single",
    splitChunks: {
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/](?!(sql-formatter|jspdf|html2canvas|html2canvas-pro)[\\/])/,
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
          test: /[\\/]node_modules[\\/](html2canvas|html2canvas-pro)[\\/]/,
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
      filename: isDevMode ? "[name].css" : "[name].[contenthash].css",
      chunkFilename: isDevMode ? "[id].css" : "[id].[contenthash].css",

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
    new rspack.BannerPlugin(getBannerOptions(LICENSE_TEXT)),
    // https://github.com/orgs/remarkjs/discussions/903
    new rspack.ProvidePlugin({
      process: "process/browser.js",
      Buffer: ["buffer", "Buffer"],
    }),
    new rspack.EnvironmentPlugin({
      WEBPACK_BUNDLE: "development",
      MB_LOG_ANALYTICS: "false",
      ENABLE_CLJS_HOT_RELOAD: process.env.ENABLE_CLJS_HOT_RELOAD ?? "false",
    }),
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
    allowedHosts: ["localhost", ...TEST_CUSTOM_DOMAINS],
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

if (isDevMode) {
  if (!config.output || !config.resolve || !config.plugins) {
    throw new Error("webpack config is missing configuration");
  }

  // replace minified files with un-minified versions
  const aliases = config.resolve.alias || {};

  Object.entries(aliases).forEach(([name, minified]) => {
    if (typeof minified !== "string") {
      return;
    }

    const unminified = minified.replace(/[.-\/]min\b/g, "");
    if (minified !== unminified && fs.existsSync(unminified)) {
      aliases[name] = unminified;
    }
  });

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

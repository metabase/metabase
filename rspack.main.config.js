// @ts-check
/* eslint-env node */

const fs = require("fs");

const rspack = require("@rspack/core");
const { ReactRefreshRspackPlugin } = require("@rspack/plugin-react-refresh");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const WebpackNotifierPlugin = require("webpack-notifier");
const {
  COMPRESSION_CONFIG,
} = require("./frontend/build/shared/rspack/compression");
const {
  bundleStatsPlugins,
} = require("./frontend/build/shared/rspack/bundle-stats");

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
  CssVarsDeclarationPlugin,
} = require("./frontend/build/shared/rspack/plugins/CssVarsDeclarationPlugin/css-vars-declaration-plugin");
const {
  RESOLVE_ALIASES,
} = require("./frontend/build/shared/rspack/resolve-aliases");
const {
  SIDE_EFFECT_FREE_RULE,
} = require("./frontend/build/shared/rspack/side-effect-free-modules");
const { SVGO_CONFIG } = require("./frontend/build/shared/rspack/svgo-config");

const SRC_PATH = __dirname + "/frontend/src/metabase";
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";
const BUILD_PATH = __dirname + "/resources/frontend_client";

// Data apps are an enterprise plugin (the iframe entry + its template live in the
// enterprise tree), so their build entries and HTML are only produced in EE builds.
const isEEBuild = process.env.MB_EDITION === "ee";

// For sharing the embedding snippets in the docs with the embedding
// onboarding flow in the app to keep the snippets always in sync.
const SDK_DOCS_SNIPPETS_PATH = __dirname + "/docs/embedding/sdk/snippets";

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
        plugins: [
          ["@swc/plugin-emotion", { sourceMap: isDevMode }],
          // instrumentation slows builds significantly and should only run in the nightly coverage CI job.
          ...(process.env.INSTRUMENT_COVERAGE === "true"
            ? [["swc-plugin-coverage-instrument", {}]]
            : []),
        ],
      },
    },

    sourceMaps: true,
    minify: false, // produces same bundle size, but cuts 1s locally
    env: {},
  },
};

class OnScriptError {
  apply(/** @type {import("webpack").Compiler} */ compiler) {
    compiler.hooks.compilation.tap(
      "OnScriptError",
      (/** @type {import("webpack").Compilation} */ compilation) => {
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
      },
    );
  }
}

const PRELOAD_MARKER = "<!-- asset-preloads -->";

/**
 * The bundle tags are injected at the end of <head>, after ~124 kB of inline JSON,
 * so the browser only discovers them once nearly the whole document has arrived.
 * This emits `rel=preload` copies near the top of <head> instead, where they land in
 * the first flight of response bytes. Templates without the marker are left alone.
 */
class PreloadAssetTags {
  apply(/** @type {import("webpack").Compiler} */ compiler) {
    compiler.hooks.compilation.tap(
      "PreloadAssetTags",
      (/** @type {import("webpack").Compilation} */ compilation) => {
        HtmlWebpackPlugin.getHooks(compilation).afterTemplateExecution.tapAsync(
          "PreloadAssetTags",
          (data, cb) => {
            if (!data.html.includes(PRELOAD_MARKER)) {
              cb(null, data);
              return;
            }

            const hints = data.headTags
              .flatMap((tag) => {
                if (tag.tagName === "script" && tag.attributes.src) {
                  return [{ url: tag.attributes.src, as: "script" }];
                }
                if (
                  tag.attributes.rel === "stylesheet" &&
                  tag.attributes.href
                ) {
                  return [{ url: tag.attributes.href, as: "style" }];
                }
                return [];
              })
              .map(
                (hint) =>
                  `<link rel="preload" href="${hint.url}" as="${hint.as}">`,
              )
              .join("");

            data.html = data.html.replace(PRELOAD_MARKER, hints);
            cb(null, data);
          },
        );
      },
    );
  }
}

/** @type {import('@rspack/cli').Configuration} */
const config = {
  mode: isDevMode ? "development" : "production",
  context: SRC_PATH,

  // output a bundle for the app JS and a bundle for styles
  // eventually we should have multiple (single file) entry points for various pieces of the app to enable code splitting
  entry: {
    "app-main": "./app-main.ts",
    "app-public": "./app-public.ts",
    "app-embed": "./app-embed.ts",
    "app-embed-sdk": "./app-embed-sdk.tsx",
    "app-embed-mcp": "./app-embed-mcp.tsx",
    styles: "./css/index.module.css",
    ...(isEEBuild && {
      "app-data-app":
        ENTERPRISE_SRC_PATH + "/data_apps/runtime/app-data-app.tsx",
      "data-app-vendors":
        ENTERPRISE_SRC_PATH + "/data_apps/runtime/iframe-vendors.ts",
    }),
  },

  // we override it for dev mode below
  devtool: "source-map",

  externals: {
    canvg: "canvg",
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
      SIDE_EFFECT_FREE_RULE,
      {
        // swc breaks styles for the whole app if we process this file
        test: /css\/core\/fonts\.styled\.ts$/,
        exclude: /node_modules|cljs/,
        use: [BABEL_LOADER],
      },
      {
        // Embedding onboarding flow requires sharing snippets from
        // docs, so we treat TypeScript files inside docs/ as raw text
        test: /\.tsx?$/,
        include: [SDK_DOCS_SNIPPETS_PATH],
        type: "asset/source",
      },
      {
        test: /\.(tsx?|jsx?)$/,
        exclude: [
          /node_modules/,
          /cljs/,
          /css\/core\/fonts\.styled\.ts/,
          SDK_DOCS_SNIPPETS_PATH,
        ],
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
    extensions: [".js", ".jsx", ".ts", ".tsx", ".css", ".svg"],
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
          test: /[\\/]node_modules[\\/]/,
          // The data-app and MCP iframes are isolated from main-app CSS/JS by
          // design; sharing the vendor chunk would re-link them. Keep their
          // node_modules in their own chunks.
          //
          // For MCP that also cuts both pages. `@modelcontextprotocol/ext-apps`
          // reaches no entry but `app-embed-mcp`, so the shared chunk was
          // charging `app-main` for it, while the MCP page pulled down a vendor
          // chunk built for an app it never runs.
          chunks: (chunk) =>
            chunk.canBeInitial() &&
            chunk.name !== "data-app-vendors" &&
            chunk.name !== "app-data-app" &&
            chunk.name !== "app-embed-mcp",
          name: "vendor",
          priority: -10,
        },
        // Modules shared by two or more async chunks (e.g. CodeMirror, pulled
        // in by every lazily loaded editor) move into a shared async chunk
        // instead of being copied into each one. `vendors` above only claims
        // initial chunks, so this never grows the initial payload.
        asyncCommons: {
          chunks: "async",
          minChunks: 2,
          reuseExistingChunk: true,
        },
        sqlFormatter: {
          test: /[\\/]sql-formatter[\\/]/,
          chunks: "all",
          name: "sql-formatter",
          priority: 10,
        },
        jspdf: {
          test: /[\\/]jspdf[\\/]/,
          chunks: "all",
          name: "jspdf",
          priority: 10,
        },
        html2canvas: {
          test: /[\\/](html2canvas|html2canvas-pro)[\\/]/,
          chunks: "all",
          name: "html2canvas",
          priority: 10,
        },
      },
    },
    minimizer: [new rspack.SwcJsMinimizerRspackPlugin()],
  },

  plugins: [
    ...bundleStatsPlugins("stats-main.json"),
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
    new PreloadAssetTags(),
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
    new HtmlWebpackPlugin({
      filename: "../../embed-sdk.html",
      chunksSortMode: "manual",
      chunks: ["vendor", "styles", "app-embed-sdk"],
      template: __dirname + "/resources/frontend_client/index_template.html",
    }),
    // Enterprise-only: data apps are an enterprise plugin, so the iframe HTML is
    // only emitted in EE builds (its chunks only exist there).
    ...(isEEBuild
      ? [
          new HtmlWebpackPlugin({
            filename: "../../data-app.html",
            chunksSortMode: "manual",
            chunks: ["data-app-vendors", "app-data-app"],
            template:
              __dirname + "/resources/frontend_client/data_app_template.html",
          }),
        ]
      : []),
    new HtmlWebpackPlugin({
      filename: "../../embed-mcp.html",
      chunksSortMode: "manual",
      // No "vendor": the cache group above leaves this entry out of it, so a
      // tag for it would fetch a chunk the page does not use.
      chunks: ["styles", "app-embed-mcp"],
      template: __dirname + "/resources/frontend_client/mcp_apps_template.html",

      // MCP apps are rendered inside a sandboxed srcdoc iframe (about:srcdoc),
      // so asset URLs must point to the Metabase instance. We embed a Mustache
      // variable in publicPath — HtmlWebpackPlugin emits it literally, then
      // Stencil substitutes it at runtime with the real instance URL.
      publicPath: "{{{instanceUrlRaw}}}/app/dist/",
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
    ...COMPRESSION_CONFIG,
  ],
};

if (shouldEnableHotRefresh) {
  config.target = "web";

  if (!config.output || !config.plugins) {
    throw new Error("webpack config is missing configuration");
  }

  // suffixing with ".hot" allows us to run both `bun run build-hot` and `bun run test` or `bun run test-watch` simultaneously
  config.output.filename = "[name].hot.bundle.js";

  // point the publicPath (inlined in index.html by HtmlWebpackPlugin) to the hot-reloading server
  config.output.publicPath =
    `http://localhost:${PORT}/` + config.output.publicPath;

  // Disable lazy compilation explicitly to match behavior of rspack 1.x
  config.lazyCompilation = false;

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
    new ReactRefreshRspackPlugin({
      // app-embed-mcp runs in an isolated iframe with CSP restrictions.
      // Excluding it avoids injecting the React Refresh runtime which uses eval.
      exclude: [SDK_DOCS_SNIPPETS_PATH, /app-embed-mcp/],
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

  if (!process.env.DISABLE_BUILD_NOTIFICATIONS) {
    config.plugins.push(
      new WebpackNotifierPlugin({
        excludeWarnings: true,
        skipFirstNotification: true,
      }),
    );
  }

  config.plugins.push(
    new CssVarsDeclarationPlugin({
      frontendSrcPath: __dirname + "/frontend/src",
      rootPath: __dirname,
    }),
  );
}

module.exports = config;

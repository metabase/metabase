/* eslint-env node */
/* eslint-disable import/no-commonjs */
/* eslint-disable import/order */
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const rspack = require("@rspack/core");
const BundleAnalyzerPlugin =
  require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const prefixwrap = require("postcss-prefixwrap");

const mainConfig = require("./rspack.main.config");
const { resolve } = require("path");
const path = require("path");

const postcssConfig = require("./postcss.config.js");

const {
  LICENSE_TEXT,
  IS_DEV_MODE,
} = require("./frontend/build/shared/constants");
const {
  OPTIMIZATION_CONFIG,
} = require("./frontend/build/embedding-sdk/rspack/shared");
const { BABEL_CONFIG } = require("./frontend/build/shared/rspack/babel-config");
const { CSS_CONFIG } = require("./frontend/build/shared/rspack/css-config");
const {
  EXTERNAL_DEPENDENCIES,
} = require("./frontend/build/embedding-sdk/constants/external-dependencies");
const {
  getBannerOptions,
} = require("./frontend/build/shared/rspack/get-banner-options");
const { SVGO_CONFIG } = require("./frontend/build/shared/rspack/svgo-config");
const {
  SDK_BUNDLE_PATH,
  SDK_BUNDLE_FILENAME,
  SDK_BUNDLE_BOOTSTRAP_FILENAME,
} = require("./frontend/build/embedding-sdk/constants/sdk-bundle");
const {
  getBuildInfoValues,
} = require("./frontend/build/embedding-sdk/rspack/get-build-info-values");
const {
  getSdkBundleVersionFromVersionProperties,
} = require("./frontend/build/embedding-sdk/lib/get-sdk-bundle-version-from-version-properties");

const SDK_BUNDLE_SRC_PATH = __dirname + "/frontend/src/embedding-sdk-bundle";

const BUILD_PATH = __dirname + "/resources/frontend_client";
const SDK_OUTPUT_PATH = path.join(BUILD_PATH, SDK_BUNDLE_PATH);

const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";

const shouldAnalyzeBundles = process.env.SHOULD_ANALYZE_BUNDLES === "true";

// Name prefix for all chunked-entry output files (runtime, split chunks, entry)
const CHUNKED_PREFIX = "embedding-sdk-chunk";

const config = {
  ...mainConfig,

  name: "embedding_sdk_bundle",

  context: SDK_BUNDLE_SRC_PATH,

  entry: {
    // Legacy monolithic bundle — backward compatible for old NPM packages.
    // Must remain a single file (splitChunks excludes it).
    "embedding-sdk": "./index.ts",
    // Bootstrap — tiny script that starts auth early and loads chunks
    "embedding-sdk-bootstrap": "./embedding-sdk-bootstrap.ts",
    // Chunked entry — same code as monolithic, but splitChunks splits it into
    // multiple smaller files for faster V8 parse+eval via parallel streaming.
    "embedding-sdk-chunked": {
      import: "./index.ts",
      runtime: "embedding-sdk-chunk-runtime",
    },
  },

  output: {
    path: SDK_OUTPUT_PATH,
    publicPath: "",
    // Unique name prevents self["webpackChunk"] collisions when the SDK
    // is loaded on a page that already has another webpack/rspack runtime
    // (e.g. the main Metabase app, Cypress test runner, customer's own app).
    uniqueName: "embedding_sdk_bundle",
    // Split chunks and bootstrap go into chunks/ subfolder.
    // The legacy monolithic bundle goes into legacy/.
    // The backend serves chunks/ with far-future immutable cache headers.
    chunkFilename: "chunks/[id].[contenthash:8].js",
    filename: (pathData) => {
      switch (pathData.chunk?.name) {
        case "embedding-sdk-bootstrap":
          return `chunks/${SDK_BUNDLE_BOOTSTRAP_FILENAME}`;
        case "embedding-sdk":
          return `legacy/${SDK_BUNDLE_FILENAME}`;
        default:
          return "chunks/[name].[contenthash:8].js";
      }
    },
  },

  devtool: IS_DEV_MODE ? mainConfig.devtool : false,

  // Same behavior as for webpack: https://rspack.rs/config/other-options#amd
  amd: {},

  module: {
    rules: [
      {
        test: /\.(tsx?|jsx?)$/,
        exclude: /node_modules|cljs/,
        use: [
          {
            loader: "babel-loader",
            options: {
              cacheDirectory: BABEL_CONFIG.cacheDirectory,
            },
          },
        ],
      },
      {
        test: /\.(svg|png)$/,
        type: "asset/inline",
        resourceQuery: { not: [/component|source/] },
      },
      {
        test: /\.css$/,
        oneOf: [
          // Scope SDK Mantine styles to the SDK to prevent leakage outside of the SDK
          {
            include: [/[\\/]@mantine[\\/].*\.css$/],
            use: [
              { loader: "style-loader" },
              { loader: "css-loader", options: CSS_CONFIG },
              {
                loader: "postcss-loader",
                options: {
                  postcssOptions: {
                    plugins: [
                      ...postcssConfig.plugins,
                      prefixwrap(":where(.mb-wrapper)", {
                        // We apply scope to selectors that start with `.m_`
                        // It skips some selectors like `[dir="ltr"] .m_*` but there's no ability to insert the `:where(.mb-wrapper)` between `[dir="ltr"]` and `.m_*`
                        ignoredSelectors: [/^(?!\.m_).*/],
                      }),
                    ],
                  },
                },
              },
            ],
          },
          {
            use: [
              { loader: "style-loader" },
              { loader: "css-loader", options: CSS_CONFIG },
              { loader: "postcss-loader" },
            ],
          },
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
              svgoConfig: SVGO_CONFIG,
            },
          },
        ],
      },
    ],
  },

  externals: EXTERNAL_DEPENDENCIES,

  optimization: {
    ...OPTIMIZATION_CONFIG,
    // Override splitChunks: split the chunked entry into multiple pieces,
    // but leave the legacy monolithic entry as a single file.
    splitChunks: {
      chunks: (chunk) => {
        // Only split chunks that belong to the chunked entry
        // (the entry itself + its runtime). Never split the legacy
        // monolithic "embedding-sdk" or the bootstrap.
        const name = chunk.name || "";
        return name.startsWith(CHUNKED_PREFIX);
      },
      // Keep chunk count low (~10-12) so HTTP/1.1 clients (no reverse proxy)
      // can load them in 1-2 waves (6 connections per domain).
      // maxSize is the primary lever — larger maxSize = fewer chunks.
      maxInitialRequests: 10,
      maxSize: 5_000_000,
      minSize: 100_000,
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          // Use a fixed name prefix so rspack merges vendors into a few chunks
          // (governed by maxSize) rather than one-per-package.
          name: "vendor",
          reuseExistingChunk: true,
        },
        default: {
          minChunks: 1,
          reuseExistingChunk: true,
        },
      },
    },
  },

  plugins: [
    new rspack.BannerPlugin(getBannerOptions(LICENSE_TEXT)),
    new rspack.BannerPlugin({
      banner: 'performance.mark("metabase-react-sdk.big-bundle-first-line");',
      raw: true,
      test: /legacy\/embedding-sdk\.js$/,
    }),
    new rspack.BannerPlugin({
      banner: 'performance.mark("metabase-react-sdk.bootstrap-first-line");',
      raw: true,
      test: /chunks\/embedding-sdk\.js$/,
    }),
    new NodePolyfillPlugin(), // for crypto, among others
    // https://github.com/remarkjs/remark/discussions/903
    new rspack.ProvidePlugin({
      process: "process/browser.js",
    }),
    new rspack.EnvironmentPlugin({
      IS_EMBEDDING_SDK: "true",
      ...getBuildInfoValues({
        version: getSdkBundleVersionFromVersionProperties(),
      }),
    }),
    // Inject chunk manifest and hashes into the bootstrap so it can load
    // all the right files with cache-busting URLs.
    {
      name: "inject-bundle-manifest",
      apply(compiler) {
        compiler.hooks.compilation.tap(
          "inject-bundle-manifest",
          (compilation) => {
            compilation.hooks.processAssets.tap(
              {
                name: "inject-bundle-manifest",
                stage:
                  rspack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER,
              },
              (assets) => {
                const bootstrapKey = `chunks/${SDK_BUNDLE_BOOTSTRAP_FILENAME}`;
                const bootstrapAsset = assets[bootstrapKey];
                if (!bootstrapAsset) {
                  return;
                }

                const crypto = require("crypto");
                const computeHash = (asset) => {
                  if (!asset) {
                    return "missing";
                  }
                  return crypto
                    .createHash("md5")
                    .update(asset.source())
                    .digest("hex")
                    .substring(0, 8);
                };

                // Collect ALL chunk files for the chunked entry using the
                // compilation's entrypoint API. This includes split chunks
                // with any name (e.g. default-vendors-*), not just those
                // matching CHUNKED_PREFIX.
                const entrypoint = compilation.entrypoints.get(
                  "embedding-sdk-chunked",
                );
                const chunkFiles = [];
                if (entrypoint) {
                  for (const chunk of entrypoint.chunks) {
                    for (const file of chunk.files) {
                      // In hot mode rspack may attach HMR payload files
                      // (*.hot-update.js) to chunk.files. Those are not
                      // executable bundle chunks and must never be loaded
                      // by the bootstrap manifest.
                      if (
                        file.endsWith(".js") &&
                        !file.includes(".hot-update.")
                      ) {
                        chunkFiles.push(file);
                      }
                    }
                  }
                }
                chunkFiles.sort();

                // Separate the runtime from the rest — runtime gets inlined
                // into the bootstrap so we avoid an extra sequential request.
                const runtimeFile =
                  chunkFiles.find((f) =>
                    /^chunks\/embedding-sdk-chunk-runtime\.[^/]+\.js$/.test(f),
                  ) ||
                  chunkFiles.find((f) => f.includes("chunk-runtime"));
                const otherFiles = chunkFiles.filter((f) => f !== runtimeFile);

                // Paths are relative to /app/ (the bootstrap's baseUrl).
                // Chunk asset keys already include "chunks/" prefix, so
                // prepend "embedding-sdk/" to get the full route path.
                const manifest = {
                  chunks: otherFiles.map((f) => `embedding-sdk/${f}`),
                };

                // Read the runtime chunk source to inline it in the bootstrap
                const runtimeSource =
                  runtimeFile && assets[runtimeFile]
                    ? assets[runtimeFile].source()
                    : "";

                if (!runtimeSource) {
                  console.warn(
                    "inject-bundle-manifest: runtime chunk not found, bootstrap will not work",
                  );
                }

                let newSource = bootstrapAsset.source();

                // Legacy monolithic bundle hash (for backward compat path)
                newSource = newSource.replace(
                  /__SDK_BUNDLE_HASH__/g,
                  computeHash(assets[`legacy/${SDK_BUNDLE_FILENAME}`]),
                );

                // Inject the chunk manifest as JSON
                newSource = newSource.replace(
                  /"__SDK_CHUNK_MANIFEST__"/g,
                  JSON.stringify(manifest),
                );

                // Inline the runtime chunk source at the end of the bootstrap.
                // The runtime sets up __webpack_require__ and the chunk registry
                // that other chunks register into when they load.
                if (runtimeSource) {
                  newSource +=
                    "\n// --- Inlined runtime chunk ---\n" + runtimeSource;
                }

                compilation.updateAsset(
                  bootstrapKey,
                  new rspack.sources.RawSource(newSource),
                );
              },
            );
          },
        );
      },
    },
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
  "sdk-specific-imports": SDK_BUNDLE_SRC_PATH + "/lib/sdk-specific-imports.ts",
};

// The SDK bundle is loaded as a standalone script, not through the dev
// server's HMR WebSocket, so HMR can never reach it. Remove devServer
// and ReactRefreshPlugin to avoid HMR runtime errors in the chunks.
delete config.devServer;
config.plugins = (config.plugins || []).filter(
  (p) => p && p.constructor?.name !== "ReactRefreshRspackPlugin",
);

if (config.cache) {
  config.cache.cacheDirectory = resolve(
    __dirname,
    "node_modules/.cache/",
    "webpack-ee",
  );
}

module.exports = config;

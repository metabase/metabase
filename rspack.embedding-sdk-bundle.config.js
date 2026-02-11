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
  CopyJsFromTmpDirectoryPlugin,
} = require("./frontend/build/shared/rspack/copy-js-from-tmp-directory-plugin");
const {
  getBannerOptions,
} = require("./frontend/build/shared/rspack/get-banner-options");
const { SVGO_CONFIG } = require("./frontend/build/shared/rspack/svgo-config");
const {
  SDK_BUNDLE_PATH,
  SDK_BUNDLE_FILENAME,
} = require("./frontend/build/embedding-sdk/constants/sdk-bundle");
const {
  getBuildInfoValues,
} = require("./frontend/build/embedding-sdk/rspack/get-build-info-values");
const {
  getSdkBundleVersionFromVersionProperties,
} = require("./frontend/build/embedding-sdk/lib/get-sdk-bundle-version-from-version-properties");

const SDK_BUNDLE_SRC_PATH =
  __dirname + "/frontend/src/embedding-sdk-bundle";

const BUILD_PATH = __dirname + "/resources/frontend_client";
const TMP_BUILD_PATH = path.resolve(BUILD_PATH, "tmp-embed-js");

const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";

const shouldAnalyzeBundles = process.env.SHOULD_ANALYZE_BUNDLES === "true";

const config = {
  ...mainConfig,

  name: "embedding_sdk_bundle",

  context: SDK_BUNDLE_SRC_PATH,

  entry: "./index.ts",

  output: {
    // we must use a different directory than the main rspack config,
    // otherwise the path conflicts and the output bundle will not appear.
    path: TMP_BUILD_PATH,
    publicPath: "./embedding-sdk/",
    filename: SDK_BUNDLE_FILENAME,
    chunkFilename: "[name].embedding-sdk.js",
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

  optimization: OPTIMIZATION_CONFIG,

  plugins: [
    new rspack.optimize.LimitChunkCountPlugin({
      maxChunks: 2,
    }),
    new rspack.BannerPlugin(getBannerOptions(LICENSE_TEXT)),
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
    shouldAnalyzeBundles &&
      new BundleAnalyzerPlugin({
        analyzerMode: "static",
        reportFilename: BUILD_PATH + "/dist/report.html",
      }),
    CopyJsFromTmpDirectoryPlugin({
      fileName: SDK_BUNDLE_FILENAME,
      tmpPath: TMP_BUILD_PATH,
      outputPath: path.join(BUILD_PATH, SDK_BUNDLE_PATH),
      copySourceMap: true,
      cleanupInDevMode: false,
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

if (config.cache) {
  config.cache.cacheDirectory = resolve(
    __dirname,
    "node_modules/.cache/",
    "webpack-ee",
  );
}

module.exports = config;

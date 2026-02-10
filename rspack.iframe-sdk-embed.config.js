/* eslint-env node */
/* eslint-disable import/no-commonjs */
/* eslint-disable import/order */
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const rspack = require("@rspack/core");
const prefixwrap = require("postcss-prefixwrap");

const mainConfig = require("./rspack.main.config");
const path = require("path");

const postcssConfig = require("./postcss.config.js");

const {
  LICENSE_TEXT,
  IS_DEV_MODE,
} = require("./frontend/build/shared/constants");
const { BABEL_CONFIG } = require("./frontend/build/shared/rspack/babel-config");
const { CSS_CONFIG } = require("./frontend/build/shared/rspack/css-config");
const {
  CopyJsFromTmpDirectoryPlugin,
} = require("./frontend/build/shared/rspack/copy-js-from-tmp-directory-plugin");
const {
  getBannerOptions,
} = require("./frontend/build/shared/rspack/get-banner-options");
const { SVGO_CONFIG } = require("./frontend/build/shared/rspack/svgo-config");

const SRC_PATH = __dirname + "/frontend/src/metabase";
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";
const SDK_BUNDLE_SRC_PATH = __dirname + "/frontend/src/embedding-sdk-bundle";
const EMBEDDING_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding";

const SCRIPT_TAG_PATH = path.resolve(
  SRC_PATH,
  "embedding/embedding-iframe-sdk/embed.ts",
);

const BUILD_PATH = __dirname + "/resources/frontend_client";

const OUT_FILE_NAME = "embed.js";
const OUT_TEMP_PATH = path.resolve(BUILD_PATH, "tmp-embed-js");

const DEV_PORT = process.env.MB_FRONTEND_DEV_PORT || 8080;

const config = {
  ...mainConfig,

  name: "iframe_sdk_embed_v1",

  entry: SCRIPT_TAG_PATH,

  output: {
    // we must use a different directory than the main rspack config,
    // otherwise the path conflicts and the output bundle will not appear.
    path: OUT_TEMP_PATH,
    filename: OUT_FILE_NAME,
    library: "metabase.embed",
    libraryTarget: "umd",
    globalObject: "this",
    publicPath: `http://localhost:${DEV_PORT}/app`,
  },

  devServer: { hot: false },

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

  optimization: {
    splitChunks: false,
    runtimeChunk: false,
  },

  plugins: [
    new rspack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
    new rspack.BannerPlugin(getBannerOptions(LICENSE_TEXT)),
    new NodePolyfillPlugin(), // for crypto, among others
    // https://github.com/remarkjs/remark/discussions/903
    new rspack.ProvidePlugin({
      process: "process/browser.js",
    }),
    new rspack.EnvironmentPlugin({
      IS_EMBEDDING_SDK: "true",
    }),
    CopyJsFromTmpDirectoryPlugin({
      fileName: OUT_FILE_NAME,
      tmpPath: OUT_TEMP_PATH,
      outputPath: path.join(BUILD_PATH, "app/"),
      copySourceMap: false,
      cleanupInDevMode: true,
    }),
  ],
};

config.resolve = {
  ...mainConfig.resolve,
  alias: {
    ...mainConfig.resolve.alias,
    metabase: SRC_PATH,
    embedding: EMBEDDING_SRC_PATH,
    "embedding-sdk-bundle": SDK_BUNDLE_SRC_PATH,
    "sdk-ee-plugins": ENTERPRISE_SRC_PATH + "/sdk-plugins",
    "sdk-iframe-embedding-ee-plugins":
      ENTERPRISE_SRC_PATH + "/sdk-iframe-embedding-plugins",
    "ee-overrides": ENTERPRISE_SRC_PATH + "/overrides",
    "sdk-specific-imports": SDK_BUNDLE_SRC_PATH + "/lib/sdk-specific-imports.ts",
  },
};

module.exports = config;

// @ts-check
/* eslint-disable no-undef */
const path = require("path");

const rspack = require("@rspack/core");

const SDK_CLI_DIST_PATH = path.join(__dirname, "/resources/embedding-sdk/dist");
const SDK_PACKAGE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/embedding-sdk-package";
const SDK_BUNDLE_SRC_PATH =
  __dirname + "/frontend/src/embedding-sdk-bundle";
const SDK_CLI_PATH = path.join(
  __dirname,
  "/enterprise/frontend/src/embedding-sdk-package/cli",
);

const METABASE_SRC_PATH = path.join(__dirname, "/frontend/src/metabase");
const TYPES_SRC_PATH = path.join(__dirname, "/frontend/src/metabase-types");

const BABEL_CONFIG = {
  cacheDirectory: process.env.BABEL_DISABLE_CACHE ? false : ".babel_cache",
};

/** @type {import('@rspack/cli').Configuration} */
const config = {
  mode: "production",
  entry: `${SDK_CLI_PATH}/cli.ts`,
  target: "node",
  context: SDK_CLI_PATH,
  output: {
    path: SDK_CLI_DIST_PATH,
    filename: "cli.js",
    library: { type: "commonjs2" },
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      metabase: METABASE_SRC_PATH,
      "metabase-types": TYPES_SRC_PATH,
      "embedding-sdk-package": SDK_PACKAGE_SRC_PATH,
      "embedding-sdk-bundle": SDK_BUNDLE_SRC_PATH,
    },
  },
  module: {
    rules: [
      {
        test: /\.(ts|js)$/,
        exclude: /node_modules/,
        use: [{ loader: "babel-loader", options: BABEL_CONFIG }],
      },
    ],
  },
  plugins: [
    new rspack.BannerPlugin({ banner: "#!/usr/bin/env node", raw: true }),
  ],
  optimization: {
    minimize: true,
    minimizer: [
      new rspack.SwcJsMinimizerRspackPlugin({
        minimizerOptions: {
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
  },
};

module.exports = config;

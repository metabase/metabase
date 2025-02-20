// @ts-check
/* eslint-disable no-undef */
const rspack = require("@rspack/core");
const path = require("path");

const SDK_CLI_DIST_PATH = path.join(__dirname, "/resources/embedding-sdk/dist");
const SDK_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding-sdk";
const SDK_CLI_PATH = path.join(
  __dirname,
  "/enterprise/frontend/src/embedding-sdk/cli",
);

const METABASE_SRC_PATH = path.join(__dirname, "/frontend/src/metabase");

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
      "embedding-sdk": SDK_SRC_PATH,
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

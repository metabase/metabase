const path = require("path");
const webpack = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");

const SDK_CLI_DIST_PATH = path.join(__dirname, "/resources/embedding-sdk/dist");

const SDK_CLI_PATH = path.join(
  __dirname,
  "/enterprise/frontend/src/embedding-sdk/cli",
);

const BABEL_CONFIG = {
  cacheDirectory: process.env.BABEL_DISABLE_CACHE ? false : ".babel_cache",
};

module.exports = {
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
    new webpack.BannerPlugin({ banner: "#!/usr/bin/env node", raw: true }),
  ],
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: { output: { comments: false } },
        extractComments: false,
      }),
    ],
  },
};

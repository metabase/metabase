/* eslint-env node */

const path = require("path");

const config = require("./rspack.main.config");

module.exports = {
  mode: "production",
  devtool: false,
  entry: {
    metabase_tracker: "./frontend/src/metabase-shared/analytics_tracker.js",
  },
  module: config.module,
  resolve: config.resolve,
  output: {
    path: path.resolve(__dirname, "resources/frontend_client/app"),
    filename: "[name].js",
  },
  optimization: {
    minimize: true,
  },
};

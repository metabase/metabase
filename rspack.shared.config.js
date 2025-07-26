/* eslint-env node */
/* eslint-disable import/no-commonjs */

const path = require("path");

const config = require("./rspack.main.config");

module.exports = {
  mode: "production",
  devtool: false,
  entry: {
    color_selector: "./frontend/src/metabase-shared/color_selector.js",
  },
  module: config.module,
  resolve: config.resolve,
  output: {
    path: path.resolve(__dirname, "resources", "frontend_shared"),
    filename: "[name].js",
    library: "shared",
  },
  optimization: {
    minimize: true,
  },
};

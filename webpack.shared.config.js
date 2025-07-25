const path = require("path");
const config = require("./webpack.config.js");

module.exports = {
  mode: "production",
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

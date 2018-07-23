const path = require("path");
const config = require("./webpack.config.js");

const SHARED_SRC = path.join(__dirname, "frontend", "src", "metabase-shared");

module.exports = {
  entry: {
    color_selector: "./frontend/src/metabase-shared/color_selector.js",
  },
  module: config.module,
  resolve: config.resolve,
  output: {
    path: path.resolve(__dirname, "resources", "frontend_shared"),
    filename: "[name].js",
    library: "shared",
    libraryTarget: "umd",
  },
};

module.exports.resolve.alias["d3"] = path.join(
  SHARED_SRC,
  "dependencies",
  "d3.js",
);

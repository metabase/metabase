const { IS_DEV_MODE } = require("../constants");

module.exports.CSS_CONFIG = {
  modules: {
    auto: (filename) =>
      !filename.includes("node_modules") && !filename.includes("vendor.css"),
    localIdentName: IS_DEV_MODE
      ? "[name]__[local]___[hash:base64:5]"
      : "[hash:base64:5]",
  },
  importLoaders: 1,
};

const { IS_DEV_MODE } = require("../constants");

module.exports.CSS_CONFIG = {
  modules: {
    auto: (filename) =>
      ["node_modules", "vendor.css", "vendor.module.css"].every(
        (excludedPattern) => !filename.includes(excludedPattern),
      ),
    localIdentName: IS_DEV_MODE
      ? "[name]__[local]___[hash:base64:5]"
      : "[hash:base64:5]",
  },
  importLoaders: 1,
};

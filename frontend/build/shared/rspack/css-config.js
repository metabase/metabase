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
  // Leave built-in font URLs untouched: fonts.css references ../fonts/... relative to
  // the emitted stylesheet (app/dist/*.css) so the browser resolves them against the
  // stylesheet URL — handling subpath hosting for free. The fonts are static,
  // backend-served assets, not bundled modules, so css-loader must not try to resolve them.
  url: {
    filter: (url) => !url.startsWith("../fonts/"),
  },
};

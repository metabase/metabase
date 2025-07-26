const rspack = require("@rspack/core");

module.exports.getBannerOptions = (bannerText) => ({
  raw: true,
  banner: bannerText,
  stage: rspack.Compilation.PROCESS_ASSETS_STAGE_DEV_TOOLING,
});

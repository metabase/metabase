// @ts-check
const {
  createStaticVizConfig,
} = require("./frontend/build/shared/rspack/static-viz-config");

const BUNDLE_NAME = "lib-static-viz-custom";

const MAX_ASSET_SIZE = 2 * 1024 * 1024;

module.exports = () =>
  createStaticVizConfig({
    entryName: BUNDLE_NAME,
    entryImport: "./app-static-viz-custom.ts",
    maxAssetSize: MAX_ASSET_SIZE,
  });

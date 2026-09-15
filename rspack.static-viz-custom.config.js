// @ts-check
const {
  createStaticVizConfig,
} = require("./frontend/build/shared/rspack/static-viz-config");

const BUNDLE_NAME = "lib-static-viz-custom";

// Budget with some headroom (10%) so a leaked dependency fails the build instead of going unnoticed.
const MAX_ASSET_SIZE = 2.15 * 1024 * 1024;

module.exports = () =>
  createStaticVizConfig({
    entryName: BUNDLE_NAME,
    entryImport: "./app-static-viz-custom.ts",
    maxAssetSize: MAX_ASSET_SIZE,
  });

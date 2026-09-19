/**
 * Shared SVGO configuration for @svgr/webpack loader
 *
 * This configuration preserves the standalone="no" attribute in SVG files
 * by disabling the defaultMarkupDeclarations option in the removeUnknownsAndDefaults plugin.
 *
 * In SVGO 3.3.2+, the removeUnknownsAndDefaults plugin removes XML declaration attributes
 * with default values (like standalone="no"). Setting defaultMarkupDeclarations to false
 * prevents this behavior.
 */
const SVGO_CONFIG = {
  plugins: [
    {
      name: "removeUnknownsAndDefaults",
      params: {
        defaultMarkupDeclarations: false,
      },
    },
  ],
};

/**
 * SVGO configuration for SVGs that the build emits as their own file.
 *
 * Each one renders as a standalone document, so the full preset is safe: nothing
 * else shares its id namespace. SVGs inlined into the DOM through @svgr use
 * SVGO_CONFIG instead, because shortened ids can collide between components.
 */
const SVGO_ASSET_CONFIG = {
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeUnknownsAndDefaults: { defaultMarkupDeclarations: false },
        },
      },
    },
  ],
};

module.exports = { SVGO_CONFIG, SVGO_ASSET_CONFIG };

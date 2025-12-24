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

module.exports = { SVGO_CONFIG };

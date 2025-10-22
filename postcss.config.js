/* eslint-env node */
/* eslint-disable import/no-commonjs */

const path = require("path");

module.exports = {
  plugins: [
    // Import other CSS files
    require("postcss-import")(),

    // Rebase/inline URLs
    require("postcss-url")(),

    /**
     * Import custom media queries and provide them globally available
     *
     * In a perfect world we should provide only breakpoints with custom media
     * definition, but some core files are not loaded elsewhere, so we add it here
     * e.g. not importing layout.module.css breaks metabot input as it has @media definitions
     */
    require("@csstools/postcss-global-data")({
      files: ["frontend/src/metabase/css/core/breakpoints.module.css"],
    }),

    // Modern CSS features & your custom-media definitions
    require("postcss-preset-env")({
      stage: 2,
      features: {
        "custom-media-queries": true,
        "custom-properties": true,
        "focus-visible-pseudo-class": false,
        "has-pseudo-class": false,
      },
    }),

    // Strip comments
    require("postcss-discard-comments")(),

    // Nesting support
    require("postcss-nesting")(),

    // Mantine preset
    require("postcss-preset-mantine")(),
  ],
};

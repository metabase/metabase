/* eslint-env node */
/* eslint-disable import/no-commonjs */

module.exports = {
  plugins: [
    // Import other CSS files
    require("postcss-import")(),

    // Rebase/inline URLs
    require("postcss-url")(),

    // import custom media queries and provide them globally available
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

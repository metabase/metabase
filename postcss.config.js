/* eslint-env node */
/* eslint-disable import/no-commonjs */

const path = require("path");

const glob = require("glob");

const SRC_PATH = path.join(__dirname, "frontend/src/metabase");
const CSS_SRC = glob
  .sync(path.join(SRC_PATH, "css/core/**/*.css"))
  // index.css imports all other files inside it
  // we can't just use index.css as styles are not applied correctly
  .filter((file) => !file.includes("index.css"));

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
      files: CSS_SRC,
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

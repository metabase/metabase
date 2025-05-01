/* eslint-env node */
/* eslint-disable import/no-commonjs */
const path = require("path");

const glob = require("glob");

const SRC_PATH = path.join(__dirname, "frontend/src/metabase");
const CSS_SRC = glob.sync(path.join(SRC_PATH, "css/**/*.css"));

module.exports = {
  plugins: [
    // Import other CSS files
    require("postcss-import")(),

    // Rebase/inline URLs
    require("postcss-url")(),

    // Modern CSS features & your custom-media definitions
    require("postcss-preset-env")({
      stage: 2,
      importFrom: CSS_SRC,
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

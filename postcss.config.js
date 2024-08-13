/* eslint-env node */
/* eslint-disable import/no-commonjs */
const glob = require("glob");

// eslint-disable-next-line no-undef
const SRC_PATH = __dirname + "/frontend/src/metabase";
const CSS_SRC = glob.sync(SRC_PATH + "/css/**/*.css");

module.exports = {
  plugins: {
    "postcss-import": {},
    "postcss-url": {},
    "postcss-preset-env": {
      stage: 2,
      importFrom: CSS_SRC,
      features: {
        "custom-media-queries": true,
        "custom-properties": true,
        "focus-visible-pseudo-class": false,
      },
    },
    "postcss-discard-comments": {},
    "postcss-nesting": {},
  },
};

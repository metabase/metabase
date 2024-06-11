/* eslint-env node */
/* eslint-disable import/no-commonjs */
const glob = require("glob");

// eslint-disable-next-line no-undef
const SRC_PATH = __dirname + "/frontend/src/metabase";
const CSS_SRC = glob.sync(SRC_PATH + "/css/**/*.css");

const IS_SDK_BUILD = process.env.IS_SDK_BUILD === "true";

module.exports = {
  plugins: {
    "postcss-import": {},
    "postcss-url": {},
    "postcss-preset-env": {
      stage: 2,
      importFrom: CSS_SRC,
      features: {
        "custom-media-queries": true,
        "custom-properties": IS_SDK_BUILD
          ? true
          : {
              preserve: false,
            },
        "color-mod-function": true,
        "focus-visible-pseudo-class": false,
      },
    },
    "postcss-discard-comments": {},
  },
};

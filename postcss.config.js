/* eslint-disable import/no-commonjs */
const _ = require("underscore");
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
      importFrom: [CSS_SRC],
    },
    "postcss-color-mod-function": {
      importFrom: [`${SRC_PATH}/css/core/colors.css`],
    },
    "postcss-custom-media": {
      importFrom: [`${SRC_PATH}/css/core/breakpoints.css`],
    },
  },
};

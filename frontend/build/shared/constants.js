const WEBPACK_BUNDLE = process.env.WEBPACK_BUNDLE || "development";

module.exports.WEBPACK_BUNDLE = WEBPACK_BUNDLE;

module.exports.IS_DEV_MODE = WEBPACK_BUNDLE !== "production";

module.exports.LICENSE_TEXT =
  "/*\n * This file is subject to the terms and conditions defined in\n * file 'LICENSE.txt', which is part of this source code package.\n */\n";

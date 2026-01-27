/* eslint-disable import/no-commonjs */

const fs = require("fs");

// eslint-disable-next-line no-undef
const pkg = JSON.parse(fs.readFileSync(__dirname + "/package.json", "utf8"));

module.exports = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules: {
    "jtag-missing-key": require("./jtag-missing-key"),
    "no-color-literals": require("./no-color-literals"),
    "no-direct-helper-import": require("./no-direct-helper-import"),
    "no-external-references-for-sdk-package-code": require("./no-external-references-for-sdk-package-code"),
    "no-literal-metabase-strings": require("./no-literal-metabase-strings"),
    "no-locale-with-intl-functions": require("./no-locale-with-intl-functions"),
    "no-oss-reinitialize-import": require("./no-oss-reinitialize-import"),
    "no-unconditional-metabase-links-render": require("./no-unconditional-metabase-links-render"),
    "no-unordered-test-helpers": require("./no-unordered-test-helpers"),
    "no-unsafe-element-filtering": require("./no-unsafe-element-filtering"),
    "no-unscoped-text-selectors": require("./no-unscoped-text-selectors"),
  },
};

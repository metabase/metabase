/* eslint-disable import/no-commonjs */

/**
 * Local ESLint plugin for Metabase custom rules
 * This makes custom rules work with both CLI and editor integrations
 */

// eslint-disable-next-line import/no-commonjs
module.exports = {
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

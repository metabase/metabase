/**
 * @fileoverview ESLint plugin for Metabase-specific linting rules
 */

module.exports = {
  meta: {
    name: "eslint-plugin-metabase",
    version: "1.0.0",
  },
  rules: {
    "jtag-missing-key": require("./rules/jtag-missing-key"),
    "no-color-literals": require("./rules/no-color-literals"),
    "no-direct-helper-import": require("./rules/no-direct-helper-import"),
    "no-external-references-for-sdk-package-code": require("./rules/no-external-references-for-sdk-package-code"),
    "no-literal-metabase-strings": require("./rules/no-literal-metabase-strings"),
    "no-locale-with-intl-functions": require("./rules/no-locale-with-intl-functions"),
    "no-oss-reinitialize-import": require("./rules/no-oss-reinitialize-import"),
    "no-unconditional-metabase-links-render": require("./rules/no-unconditional-metabase-links-render"),
    "no-unordered-test-helpers": require("./rules/no-unordered-test-helpers"),
    "no-unsafe-element-filtering": require("./rules/no-unsafe-element-filtering"),
    "no-unscoped-text-selectors": require("./rules/no-unscoped-text-selectors"),
  },
};

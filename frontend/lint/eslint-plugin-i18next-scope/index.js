/**
 * @fileoverview Local stand-in for eslint-plugin-i18next.
 *
 * The published plugin is built around i18next and leans on typescript-eslint
 * parser services that oxlint does not provide; under oxlint it reports only
 * HTML-entity artefacts and never fires on genuinely untranslated JSX text.
 * This codebase uses ttag, so the one rule we relied on is reimplemented for it.
 *
 * It is published under the `i18next` namespace, which oxlint does not reserve,
 * so the existing `eslint-disable i18next/no-literal-string` comments keep
 * suppressing it.
 */

module.exports = {
  meta: {
    name: "eslint-plugin-i18next",
    version: "1.0.0",
  },
  rules: {
    "no-literal-string": require("./no-literal-string"),
  },
};

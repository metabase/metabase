/**
 * @fileoverview Local stand-in for eslint-plugin-ttag.
 *
 * The published plugin cannot run under oxlint: its `no-module-declaration` rule
 * calls `context.getScope()`, which oxlint's plugin shim does not provide, so it
 * throws on every file containing a tagged template.
 *
 * It is published under the `ttag` namespace so the existing
 * `eslint-disable-next-line ttag/no-module-declaration` comments across the
 * codebase keep suppressing it.
 */

module.exports = {
  meta: {
    name: "eslint-plugin-ttag",
    version: "1.0.0",
  },
  rules: {
    "no-module-declaration": require("./no-module-declaration"),
  },
};

/* eslint-disable import/no-commonjs */

// "index" is required to get the original library and bypass the webpack alias
const ttag = require("ttag/index");

// ttag has "configurable: false" for module exports,
// which makes it impossible to override them when strict CSP headers are enabled;
// so here we re-export everything in a way that allows imports to be overridden by EE plugins
for (const key in ttag) {
  module.exports[key] = ttag[key];
}

/* eslint-disable import/no-commonjs */
const ttag = require("ttag/index");

for (const key in ttag) {
  module.exports[key] = ttag[key];
}

// @ts-check
/* eslint-env node */
/* eslint-disable import/no-commonjs */

const configs = [require("./rspack.main.config")];

if (process.env.MB_EDITION === "ee") {
  // Build the embed.js script for the sdk iframe embedding.
  configs.push(require("./rspack.iframe-sdk-embed.config"));
  // Build the Embedding SDK npm package.
  configs.push(require("./rspack.embedding-sdk-bundle.config"));
}

module.exports = configs;

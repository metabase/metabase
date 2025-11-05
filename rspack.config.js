// @ts-check
/* eslint-env node */
/* eslint-disable import/no-commonjs */

const configs = [
  require("./rspack.main.config"),
  // Build the embed.js script for the sdk iframe embedding
  require("./rspack.iframe-sdk-embed.config"),
];

if (
  process.env.MB_EDITION === "ee" &&
  process.env.SKIP_EMBEDDING_SDK !== "true"
) {
  // Build the Embedding SDK npm package.
  configs.push(require("./rspack.embedding-sdk-bundle.config"));
}

module.exports = configs;

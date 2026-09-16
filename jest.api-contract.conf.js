// @ts-check
// eslint-disable-next-line import/no-commonjs
const baseConfig = require("./jest.base.conf.js");

/** @type {import('jest').Config} */
// eslint-disable-next-line import/no-commonjs
module.exports = {
  ...baseConfig,
  displayName: "api-contract",
  // These tests use the real API client, but do not render visualizations.
  setupFiles: baseConfig.setupFiles.filter(
    (file) => !file.endsWith("/register-visualizations.js"),
  ),
  testMatch: [
    "<rootDir>/frontend/build/openapi/**/*.unit.spec.ts",
    "<rootDir>/frontend/src/metabase/api/define-request.unit.spec.ts",
    "<rootDir>/frontend/src/metabase/api/client/client.unit.spec.ts",
  ],
  testTimeout: 30000,
};

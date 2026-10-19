// @ts-check

/**
 * Heap retention specs.
 *
 * They need --expose-gc and a heap nobody else is touching, so they cannot join
 * the sharded default run. Use `bun run test-memory`.
 */

// eslint-disable-next-line import/no-commonjs
const baseConfig = require("./jest.base.conf.js");

/** @type {import('jest').Config} */
// eslint-disable-next-line import/no-commonjs
module.exports = {
  ...baseConfig,
  displayName: "memory",
  setupFilesAfterEnv: [
    ...baseConfig.setupFilesAfterEnv,
    "<rootDir>/frontend/test/jest-setup-env-core.js",
  ],
  testMatch: ["<rootDir>/**/*.leak.unit.spec.{ts,tsx}"],
  reporters: ["default"],
};

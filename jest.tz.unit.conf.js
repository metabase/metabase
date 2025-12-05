// @ts-check

const { baseConfig } = require("./jest.config.js");

/** @type {import('jest').Config} */
// eslint-disable-next-line import/no-commonjs
module.exports = {
  ...baseConfig,
  testMatch: ["<rootDir>/frontend/**/*.tz.unit.spec.{js,ts,jsx,tsx}"],
  testPathIgnorePatterns: ["<rootDir>/release/.*"],
  globals: {
    ...baseConfig.globals,
    ace: {},
  },
  coverageDirectory: "./",
  coverageReporters: ["text", "json-summary"],
  collectCoverageFrom: ["frontend/src/**/*.{js,ts,jsx,tsx}"],
  testTimeout: 30000,
};

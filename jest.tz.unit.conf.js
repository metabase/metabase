// @ts-check

const { baseConfig } = require("./jest.base.config.js");

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

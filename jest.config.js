// @ts-check

const { baseConfig } = require("./jest.base.config.js");

/** @type {import('jest').Config} */
const config = {
  reporters: ["default", "jest-junit"],
  coverageReporters: ["html", "lcov"],
  watchPlugins: [
    "jest-watch-typeahead/filename",
    "jest-watch-typeahead/testname",
  ],
  testTimeout: 30000,
  projects: [
    {
      ...baseConfig,
      displayName: "sdk",

      testMatch: [
        "<rootDir>/frontend/src/embedding-sdk-{bundle,shared}/**/*.unit.spec.{js,jsx,ts,tsx}",
        "<rootDir>/enterprise/frontend/src/embedding-sdk-package/**/*.unit.spec.{js,jsx,ts,tsx}",
        "<rootDir>/enterprise/frontend/src/embedding-sdk-ee/**/*.unit.spec.{js,jsx,ts,tsx}",
      ],

      setupFiles: [
        ...baseConfig.setupFiles,
        "<rootDir>/frontend/src/embedding-sdk-shared/jest/setup-env.js",
      ],

      setupFilesAfterEnv: [
        ...baseConfig.setupFilesAfterEnv,
        "<rootDir>/frontend/src/embedding-sdk-shared/jest/setup-after-env.js",
        "<rootDir>/frontend/src/embedding-sdk-shared/jest/console-restrictions.js",
      ],
    },
    {
      ...baseConfig,
      displayName: "core",
      testPathIgnorePatterns: [
        ...(baseConfig.testPathIgnorePatterns || []),
        "<rootDir>/frontend/src/embedding-sdk-bundle",
        "<rootDir>/frontend/src/embedding-sdk-shared",
        "<rootDir>/enterprise/frontend/src/embedding-sdk-package",
        "<rootDir>/enterprise/frontend/src/embedding-sdk-ee",
      ],
    },
  ],
};

// eslint-disable-next-line import/no-commonjs
module.exports = config;

// @ts-check
/** eslint-disable-next-line import/no-commonjs */
const baseConfig = require("./jest.base.conf.js");
// Heap measurement specs. They run from jest.memory.conf.js, never from the
// default sharded run, because they need --expose-gc and a quiet heap.
const MEMORY_TEST_PATTERN = "\\.leak\\.unit\\.spec\\.";

const nodeProject = {
  testEnvironment: "node",
  transform: baseConfig.transform,
  transformIgnorePatterns: baseConfig.transformIgnorePatterns,
};

/** @type {import('jest').Config} */
const config = {
  // `addFileAttribute` makes jest-junit emit the source path as a `file`
  // attribute on each <testcase>, which lets the ci-conductor reporter resolve a
  // real source file. Output dir/name come from the JEST_JUNIT_OUTPUT_* env vars.
  reporters: ["default", ["jest-junit", { addFileAttribute: "true" }]],
  coverageReporters: ["html", "lcov"],
  watchPlugins: [
    "jest-watch-typeahead/filename",
    "jest-watch-typeahead/testname",
  ],
  testTimeout: 30000,
  // CI narrows a run to the plan's spec files by pointing this at a JSON list.
  ...(process.env.JEST_TEST_PATHS_FILE && {
    filter: "<rootDir>/frontend/test/jest-test-paths-filter.js",
  }),
  projects: [
    {
      ...baseConfig,
      displayName: "sdk",

      testMatch: [
        "<rootDir>/frontend/src/embedding-sdk-{bundle,shared}/**/*.unit.spec.{ts,tsx}",
        "<rootDir>/enterprise/frontend/src/embedding-sdk-package/**/*.unit.spec.{ts,tsx}",
        "<rootDir>/enterprise/frontend/src/embedding-sdk-ee/**/*.unit.spec.{ts,tsx}",
      ],

      testPathIgnorePatterns: [
        ...(baseConfig.testPathIgnorePatterns || []),
        MEMORY_TEST_PATTERN,
      ],

      setupFiles: [
        ...baseConfig.setupFiles,
        "<rootDir>/frontend/src/embedding-sdk-shared/jest/setup-env.ts",
      ],

      setupFilesAfterEnv: [
        ...baseConfig.setupFilesAfterEnv,
        "<rootDir>/frontend/src/embedding-sdk-shared/jest/setup-after-env.ts",
        "<rootDir>/frontend/src/embedding-sdk-shared/jest/console-restrictions.ts",
      ],
    },
    {
      ...baseConfig,
      displayName: "core",
      setupFilesAfterEnv: [
        ...baseConfig.setupFilesAfterEnv,
        "<rootDir>/frontend/test/jest-setup-env-core.js",
      ],
      testPathIgnorePatterns: [
        ...(baseConfig.testPathIgnorePatterns || []),
        "<rootDir>/frontend/src/embedding-sdk-bundle",
        "<rootDir>/frontend/src/embedding-sdk-shared",
        "<rootDir>/enterprise/frontend/src/embedding-sdk-package",
        "<rootDir>/enterprise/frontend/src/embedding-sdk-ee",
        "<rootDir>/enterprise/frontend/src/custom-viz",
        "<rootDir>/frontend/lint/tests",
        "<rootDir>/.github",
        MEMORY_TEST_PATTERN,
      ],
    },
    {
      ...nodeProject,
      displayName: "lint-rules",
      testMatch: ["<rootDir>/frontend/lint/tests/**/*.unit.spec.js"],
    },
    {
      ...nodeProject,
      displayName: "ci-scripts",
      testMatch: ["<rootDir>/.github/**/*.unit.spec.{js,jsx,ts,tsx}"],
    },
  ],
};

module.exports = config;

// @ts-check
/** eslint-disable-next-line import/no-commonjs */
const esmPackages = require("./jest.esm-packages.js");

const swcJestTransform = [
  "@swc/jest",
  {
    jsc: {
      // Jest runs on Node so we can target a modern engine and skip a bunch
      // of polyfills/transforms that `env.targets: ["defaults"]` would emit.
      target: "es2022",
      loose: true,
      parser: {
        syntax: "typescript",
        tsx: true,
      },
      transform: {
        react: {
          runtime: "automatic",
        },
      },
      experimental: {
        plugins: [
          ["swc_mut_cjs_exports", {}],
          ["@swc/plugin-emotion", { sourceMap: false }],
        ],
      },
    },
    module: {
      type: "commonjs",
    },
    sourceMaps: "inline",
    minify: false,
  },
];

const swcTransform = {
  "^.+\\.[jt]sx?$": swcJestTransform,
};

const frontendUnitTestMatch = [
  "<rootDir>/frontend/src/metabase/**/*.unit.spec.{js,jsx,ts,tsx}",
  "<rootDir>/frontend/src/metabase-lib/**/*.unit.spec.{js,jsx,ts,tsx}",
  "<rootDir>/enterprise/frontend/src/metabase-enterprise/**/*.unit.spec.{js,jsx,ts,tsx}",
  "<rootDir>/enterprise/frontend/src/embedding/**/*.unit.spec.{js,jsx,ts,tsx}",
  "<rootDir>/frontend/test/**/*.unit.spec.{js,jsx,ts,tsx}",
];

const toolingUnitTestMatch = [
  "<rootDir>/.github/**/*.unit.spec.js",
  "<rootDir>/bin/**/*.unit.spec.{js,ts}",
  "<rootDir>/frontend/build/**/*.unit.spec.{js,ts}",
];

const frontendUnitTestRoots = [
  "<rootDir>/frontend/src",
  "<rootDir>/frontend/test",
  "<rootDir>/enterprise/frontend/src",
];

const toolingUnitTestRoots = [
  "<rootDir>/.github",
  "<rootDir>/bin",
  "<rootDir>/frontend/build",
];

const ignoredGeneratedPaths = [
  "<rootDir>/.clj-kondo/.cache/",
  "<rootDir>/.lsp/.cache/",
  "<rootDir>/coverage/",
  "<rootDir>/e2e/embedding-sdk-host-apps/.*/dist/",
  "<rootDir>/e2e/embedding-sdk-host-apps/.*/node_modules/",
  "<rootDir>/modules/.*/target/",
  "<rootDir>/release/node_modules/",
  "<rootDir>/resources/embedding-sdk/dist/",
  "<rootDir>/resources/frontend_client/",
  "<rootDir>/storybook-static/",
  "<rootDir>/target/",
];

const baseConfig = {
  transform: swcTransform,
  moduleNameMapper: {
    // Force jose to use Node.js runtime instead of browser runtime in jsdom environment.
    // The browser runtime expects CryptoKey to be globally available, which jsdom doesn't provide.
    "^jose$": "<rootDir>/node_modules/jose/dist/node/cjs/index.js",
    "^build-configs/(.*)$": "<rootDir>/frontend/build/$1",
    "\\.(css|less)$": "<rootDir>/frontend/test/__mocks__/styleMock.js",
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/frontend/test/__mocks__/fileMock.js",
    "^cljs/(.*)$": "<rootDir>/target/cljs_release/$1",
    "\\.svg\\?(component|source)":
      "<rootDir>/frontend/test/__mocks__/svgMock.tsx",
    "csv-parse/browser/esm/sync":
      "<rootDir>/node_modules/csv-parse/dist/cjs/sync",
    "csv-stringify/browser/esm/sync":
      "<rootDir>/node_modules/csv-stringify/dist/cjs/sync",
    /**
     * SDK components import root SDK folder (`embedding-sdk`) that contains the ee plugins.
     * This isn't a problem in the core app because we seem to not import to entry file directly
     * for any component under tests.
     */
    "sdk-ee-plugins": "<rootDir>/frontend/src/metabase/plugins/noop.ts",
    /**
     * SDK iframe embedding imports the embedding sdk and its components.
     * We want to exclude the SDK from the main app's bundle to reduce the bundle size.
     */
    "sdk-iframe-embedding-ee-plugins":
      "<rootDir>/frontend/src/metabase/utils/noop.ts",
    "ee-plugins": "<rootDir>/frontend/src/metabase/utils/noop.ts",
    /**
     * Imports which are only applicable to the embedding sdk.
     * As we use SDK components in new iframe embedding, we need to import them here.
     **/
    "sdk-specific-imports": "<rootDir>/frontend/src/metabase/utils/noop.ts",
    /**
     * Docs snippets are loaded as raw text (asset/source) in rspack.
     * In Jest, mock them as plain strings.
     */
    "^docs/embedding/sdk/snippets/(.*)$":
      "<rootDir>/frontend/test/__mocks__/fileMock.js",
    "docs/(.*)$": "<rootDir>/docs/$1",
  },
  transformIgnorePatterns: [
    // Combined pattern for both flat and bun isolated node_modules structures
    // - Flat: node_modules/<pkg>/ where <pkg> is NOT in esmPackages
    // - Bun:  node_modules/.bun/<pkg>@<ver>/ where <pkg> is NOT in esmPackages
    `<rootDir>/node_modules/(?:\\.bun/(?!(${esmPackages.join("|")})@)|(?!\\.bun)(?!(${esmPackages.join("|")})/))`,
    // CLJS files are already compiled CJS — skip transform entirely
    "<rootDir>/target/cljs_dev/",
    "<rootDir>/target/cljs_release/",
  ],
  testPathIgnorePatterns: [
    "<rootDir>/frontend/.*/.*.tz.unit.spec.{js,jsx,ts,tsx}",
    "<rootDir>/release/.*",
  ],
  testMatch: frontendUnitTestMatch,
  roots: frontendUnitTestRoots,
  modulePaths: [
    "<rootDir>/frontend/test",
    "<rootDir>/frontend/src",
    "<rootDir>/enterprise/frontend/src",
  ],
  modulePathIgnorePatterns: [
    "<rootDir>/target/cljs_release/.*",
    "<rootDir>/target/classes/.*",
    "<rootDir>/resources/frontend_client",
    "<rootDir>/.*/__mocks__",
    "<rootDir>/enterprise/frontend/src/custom-viz",
  ],
  setupFiles: [
    "<rootDir>/frontend/test/jest-setup.js",
    "<rootDir>/frontend/test/metabase-bootstrap.js",
    "<rootDir>/frontend/test/register-visualizations.js",
  ],
  setupFilesAfterEnv: ["<rootDir>/frontend/test/jest-setup-env.js"],
  globals: {
    ga: {},
  },
  coverageDirectory: "./coverage",
  collectCoverageFrom: [
    "frontend/src/**/*.{js,jsx,ts,tsx}",
    "enterprise/frontend/src/**/*.{js,jsx,ts,tsx}",
    "!<rootDir>/**/*.styled.{js,jsx,ts,tsx}",
    "!<rootDir>/**/*.story.{js,jsx,ts,tsx}",
    "!<rootDir>/**/*.info.{js,jsx,ts,tsx}",
    "!<rootDir>/**/*.unit.spec.{js,jsx,ts,tsx}",
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/frontend/src/metabase/visualizations/lib/errors.js",
    "/target/cljs_dev/",
    "/target/cljs_release/",
    "/frontend/test/",
  ],
  testEnvironment: "jest-environment-jsdom",
};

/** @type {import('jest').Config} */
const config = {
  reporters: ["default", "jest-junit"],
  coverageReporters: ["html", "lcov"],
  watchPathIgnorePatterns: ignoredGeneratedPaths,
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
    },
    {
      displayName: "lint-rules",
      testMatch: ["<rootDir>/frontend/lint/tests/**/*.unit.spec.js"],
      roots: ["<rootDir>/frontend/lint"],
      testEnvironment: "node",
      transform: baseConfig.transform,
      transformIgnorePatterns: baseConfig.transformIgnorePatterns,
    },
    {
      displayName: "tooling",
      testMatch: toolingUnitTestMatch,
      roots: toolingUnitTestRoots,
      testEnvironment: "node",
      transform: baseConfig.transform,
      transformIgnorePatterns: baseConfig.transformIgnorePatterns,
    },
  ],
};

module.exports = config;

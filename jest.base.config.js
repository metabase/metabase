// @ts-check

const esmPackages = [
  "bail",
  "ccount",
  "character-entities.*",
  "comma-separated-tokens",
  "csv-parse",
  "csv-stringify",
  "d3-.*",
  "d3",
  "decode-named-character-reference",
  "delaunator",
  "devlop",
  "echarts",
  "escape-string-regexp",
  "extend",
  "fetch-mock",
  "hast.*",
  "html-void-elements",
  "internmap",
  "is-absolute-url",
  "is-plain-obj",
  "jose",
  "mdast-util-.*",
  "micromark.*",
  "property-information",
  "react-markdown",
  "rehype-.*",
  "remark-.*",
  "robust-predicates",
  "space-separated-tokens",
  "stringify-entities",
  "trim-lines",
  "trough",
  "unified",
  "unist-.*",
  "vfile.*",
  "web-namespaces",
  "zrender",
  "zwitch",
];

/** @type {import('jest').Config} */
const baseConfig = {
  moduleNameMapper: {
    // Static file mocks - MUST come before path aliases to intercept .css imports
    "\\.(css|less)$": "<rootDir>/frontend/test/__mocks__/styleMock.js",
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/frontend/test/__mocks__/fileMock.js",
    "\\.svg\\?(component|source)":
      "<rootDir>/frontend/test/__mocks__/svgMock.jsx",

    // Explicit path mappings for Yarn PnP compatibility
    // These replace modulePaths resolution which doesn't work reliably with PnP
    // Note: Need both bare imports (^pkg$) and path imports (^pkg/(.*)$)
    "^metabase-enterprise$":
      "<rootDir>/enterprise/frontend/src/metabase-enterprise/index",
    "^metabase-enterprise/(.*)$":
      "<rootDir>/enterprise/frontend/src/metabase-enterprise/$1",
    "^embedding/(.*)$": "<rootDir>/enterprise/frontend/src/embedding/$1",
    "^embedding-sdk-ee/(.*)$":
      "<rootDir>/enterprise/frontend/src/embedding-sdk-ee/$1",
    "^metabase-lib$": "<rootDir>/frontend/src/metabase-lib/index",
    "^metabase-lib/(.*)$": "<rootDir>/frontend/src/metabase-lib/$1",
    "^metabase-types/(.*)$": "<rootDir>/frontend/src/metabase-types/$1",
    "^metabase-shared/(.*)$": "<rootDir>/frontend/src/metabase-shared/$1",
    "^metabase/(.*)$": "<rootDir>/frontend/src/metabase/$1",
    "^embedding-sdk-shared/(.*)$":
      "<rootDir>/frontend/src/embedding-sdk-shared/$1",
    "^embedding-sdk-bundle/(.*)$":
      "<rootDir>/frontend/src/embedding-sdk-bundle/$1",
    "^__support__/(.*)$": "<rootDir>/frontend/test/__support__/$1",

    // Build configs
    "^build-configs/(.*)$": "<rootDir>/frontend/build/$1",

    // ClojureScript output
    "^cljs/(.*)$": "<rootDir>/target/cljs_dev/$1",

    /**
     * SDK components import root SDK folder (`embedding-sdk`) that contains the ee plugins.
     * This isn't a problem in the core app because we seem to not import to entry file directly
     * for any component under tests.
     */
    "sdk-ee-plugins": "<rootDir>/frontend/src/metabase/plugins/noop.js",
    /**
     * SDK iframe embedding imports the embedding sdk and its components.
     * We want to exclude the SDK from the main app's bundle to reduce the bundle size.
     */
    "sdk-iframe-embedding-ee-plugins":
      "<rootDir>/frontend/src/metabase/lib/noop.js",
    "ee-plugins": "<rootDir>/frontend/src/metabase/lib/noop.js",
    /**
     * Imports which are only applicable to the embedding sdk.
     * As we use SDK components in new iframe embedding, we need to import them here.
     **/
    "sdk-specific-imports": "<rootDir>/frontend/src/metabase/lib/noop.js",
    "docs/(.*)$": "<rootDir>/docs/$1",
  },
  transformIgnorePatterns: [
    // ESM packages need to be transformed by Jest
    // Single pattern that works for both node_modules and Yarn PnP:
    // - node_modules/package-name/ (traditional)
    // - .yarn/cache/package-name-npm-*.zip/node_modules/package-name/ (PnP cache)
    // - .yarn/__virtual__/package-name-virtual-*/... (PnP virtual)
    `node_modules/(?!(${esmPackages.join("|")})/)`,
  ],
  testPathIgnorePatterns: [
    "<rootDir>/frontend/.*/.*.tz.unit.spec.{js,jsx,ts,tsx}",
    "<rootDir>/release/.*",
  ],
  testMatch: [
    "<rootDir>/**/*.unit.spec.js",
    "<rootDir>/**/*.unit.spec.{js,jsx,ts,tsx}",
  ],
  modulePaths: [
    "<rootDir>/frontend/test",
    "<rootDir>/frontend/src",
    "<rootDir>/enterprise/frontend/src",
  ],
  modulePathIgnorePatterns: [
    "<rootDir>/target/cljs_release/.*",
    "<rootDir>/resources/frontend_client",
    "<rootDir>/.*/__mocks__",
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

// eslint-disable-next-line import/no-commonjs
module.exports = { baseConfig, esmPackages };

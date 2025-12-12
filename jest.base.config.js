// @ts-check

const esmPackages = [
  "ccount",
  "character-entities-html4",
  "comma-separated-tokens",
  "csv-parse",
  "csv-stringify",
  "d3-.*",
  "d3",
  "delaunator",
  "devlop",
  "echarts",
  "fetch-mock",
  "hast.*",
  "html-void-elements",
  "internmap",
  "is-absolute-url",
  "jose",
  "mdast-util-.*",
  "property-information",
  "rehype-.*",
  "remark-.*",
  "robust-predicates",
  "space-separated-tokens",
  "stringify-entities",
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
    "^build-configs/(.*)$": "<rootDir>/frontend/build/$1",
    "\\.(css|less)$": "<rootDir>/frontend/test/__mocks__/styleMock.js",
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/frontend/test/__mocks__/fileMock.js",
    "^cljs/(.*)$": "<rootDir>/target/cljs_dev/$1",
    "react-markdown":
      "<rootDir>/node_modules/react-markdown/react-markdown.min.js",
    "\\.svg\\?(component|source)":
      "<rootDir>/frontend/test/__mocks__/svgMock.jsx",
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
    // Updated pattern to handle pnpm's nested node_modules structure
    // pnpm paths look like: node_modules/.pnpm/fetch-mock@12.5.3/node_modules/fetch-mock/
    `/node_modules/(?!(.pnpm/.+/node_modules/)?(${esmPackages.join("|")})/)`,
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

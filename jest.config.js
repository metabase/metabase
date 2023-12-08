// @ts-check
/** @type {import('jest').Config} */
const config = {
  moduleNameMapper: {
    "\\.(css|less)$": "<rootDir>/frontend/test/__mocks__/styleMock.js",
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/frontend/test/__mocks__/fileMock.js",
    "^promise-loader\\?global\\!metabase-lib\\/metadata\\/utils\\/ga-metadata$":
      "<rootDir>/frontend/src/metabase-lib/metadata/utils/ga-metadata.js",
    "ace/ext-searchbox":
      "<rootDir>/frontend/test/__mocks__/aceSearchBoxExtMock.js",
    "^cljs/(.*)$": "<rootDir>/target/cljs_dev/$1",
    "^d3-(.*)$": "<rootDir>/node_modules/d3-$1/dist/d3-$1",
    "react-markdown":
      "<rootDir>/node_modules/react-markdown/react-markdown.min.js",
    "\\.svg\\?(component|source)":
      "<rootDir>/frontend/test/__mocks__/svgMock.jsx",
  },
  transformIgnorePatterns: [
    "<rootDir>/node_modules/(?!rehype-external-links/)",
  ],
  testPathIgnorePatterns: [
    "<rootDir>/frontend/.*/.*.tz.unit.spec.{js,jsx,ts,tsx}",
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
  modulePathIgnorePatterns: ["<rootDir>/target/cljs_release/.*"],
  setupFiles: [
    "<rootDir>/frontend/test/jest-setup.js",
    "<rootDir>/frontend/test/metabase-bootstrap.js",
    "<rootDir>/frontend/test/register-visualizations.js",
  ],
  setupFilesAfterEnv: [
    "@testing-library/jest-dom",
    "<rootDir>/frontend/test/jest-setup-env.js",
  ],
  globals: {
    ace: {},
    ga: {},
  },
  coverageDirectory: "./coverage",
  coverageReporters: ["html", "lcov"],
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
  watchPlugins: [
    "jest-watch-typeahead/filename",
    "jest-watch-typeahead/testname",
  ],
  testTimeout: 30000,
};

// eslint-disable-next-line import/no-commonjs
module.exports = config;

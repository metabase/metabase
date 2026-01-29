// @ts-check

// eslint-disable-next-line import/no-commonjs
const esmPackages = require("./jest.esm-packages.js");

/** @type {import('jest').Config} */
// eslint-disable-next-line import/no-commonjs
module.exports = {
  moduleNameMapper: {
    "\\.(css|less)$": "<rootDir>/frontend/test/__mocks__/styleMock.js",
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/frontend/test/__mocks__/fileMock.js",
    "^cljs/(.*)$": "<rootDir>/target/cljs_dev/$1",
    "\\.svg\\?(component|source)":
      "<rootDir>/frontend/test/__mocks__/svgMock.jsx",
  },
  transformIgnorePatterns: [
    // Combined pattern for both flat and bun isolated node_modules structures
    `<rootDir>/node_modules/(?:\\.bun/(?!(${esmPackages.join("|")})@)|(?!\\.bun)(?!(${esmPackages.join("|")})/))`,
  ],
  testMatch: ["<rootDir>/frontend/**/*.tz.unit.spec.{js,ts,jsx,tsx}"],
  modulePaths: [
    "<rootDir>/frontend/test",
    "<rootDir>/frontend/src",
    "<rootDir>/enterprise/frontend/src",
  ],
  setupFiles: [
    "<rootDir>/frontend/test/jest-setup.js",
    "<rootDir>/frontend/test/metabase-bootstrap.js",
    "<rootDir>/frontend/test/register-visualizations.js",
  ],
  globals: {
    ace: {},
    ga: {},
  },
  coverageDirectory: "./",
  coverageReporters: ["text", "json-summary"],
  collectCoverageFrom: ["frontend/src/**/*.{js,ts,jsx,tsx}"],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/frontend/src/metabase/visualizations/lib/errors.js",
  ],
  testEnvironment: "jest-environment-jsdom",
  testTimeout: 30000,
};

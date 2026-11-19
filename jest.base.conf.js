// @ts-check
// eslint-disable-next-line import/no-commonjs
const esmPackages = require("./jest.esm-packages.js");

const swcTransformOptions = {
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
        ["@swc-contrib/mut-cjs-exports", {}],
        ["@swc/plugin-emotion", { sourceMap: false }],
      ],
    },
  },
  module: {
    type: "commonjs",
    // Preserve relative-import initialization order outside application
    // source, including tests, the test harness, and third-party packages.
    lazy: true,
  },
  sourceMaps: "inline",
  minify: false,
};

const swcJestTransform = ["@swc/jest", swcTransformOptions];
const swcSourceTransform = [
  "@swc/jest",
  {
    ...swcTransformOptions,
    module: {
      ...swcTransformOptions.module,
      // `lazy: true` excludes relative imports. Application barrels otherwise
      // evaluate their entire dependency graph, even for unused re-exports.
      lazy: { patterns: [".*"] },
    },
  },
];

const baseConfig = {
  transform: {
    // These public barrels register endpoints as a side effect. State fixtures
    // import them before seeding the shared API cache, without reading exports.
    "^.+[/\\\\]metabase[/\\\\](current-user|settings)[/\\\\]index\\.ts$":
      swcJestTransform,
    // Test helpers also rely on import/mock initialization order.
    "\\.spec\\.m?[jt]sx?$": swcJestTransform,
    "[/\\\\](__mocks__|__support__|shared-tests|tests?)[/\\\\].+\\.m?[jt]sx?$":
      swcJestTransform,
    "[/\\\\]([^/\\\\]*[.-])?test-utils\\.m?[jt]sx?$": swcJestTransform,
    // Do not change initialization in SDK bootstrap code or custom-viz tools.
    "^.+[/\\\\]frontend[/\\\\]src[/\\\\](metabase(?:-enterprise)?|metabase-lib|metabase-types)[/\\\\].+\\.m?[jt]sx?$":
      swcSourceTransform,
    "^.+\\.m?[jt]sx?$": swcJestTransform,
  },
  moduleNameMapper: {
    // Force jose to use Node.js runtime instead of browser runtime in jsdom environment.
    // The browser runtime expects CryptoKey to be globally available, which jsdom doesn't provide.
    "^jose$": "<rootDir>/node_modules/jose/dist/node/cjs/index.js",
    // remend only declares an `import` export condition, so jest's CJS resolver can't find it.
    "^remend$": "<rootDir>/node_modules/remend/dist/index.js",
    "^build-configs/(.*)$": "<rootDir>/frontend/build/$1",
    "\\.(css|less)$": "<rootDir>/frontend/test/__mocks__/styleMock.js",
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)(\\?url)?$":
      "<rootDir>/frontend/test/__mocks__/fileMock.js",
    "^cljs/(.*)$": "<rootDir>/target/cljs_dev/$1",
    // The real catalogues are a build artifact, so tests resolve a small fixture
    // per locale instead.
    "^locales/(.*)\\.json$":
      "<rootDir>/frontend/test/__mocks__/locales/$1.json",
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
    "ee-overrides": "<rootDir>/frontend/src/metabase/utils/noop.ts",
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
  ],
  testPathIgnorePatterns: [
    "<rootDir>/frontend/.*/.*.tz.unit.spec.{js,jsx,ts,tsx}",
    "<rootDir>/release/.*",
  ],
  testMatch: ["<rootDir>/**/*.unit.spec.{js,jsx,ts,tsx}"],
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
  setupFilesAfterEnv: [
    "<rootDir>/frontend/test/jest-setup-eager.js",
    "<rootDir>/frontend/test/jest-setup-env.js",
  ],
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
    "/target/cljs_dev/",
    "/target/cljs_release/",
    "/frontend/test/",
  ],
  testEnvironment: "jest-environment-jsdom",
  testRunner: "<rootDir>/frontend/test/jest-test-runner.js",
};

// eslint-disable-next-line import/no-commonjs
module.exports = baseConfig;

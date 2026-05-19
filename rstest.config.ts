import path from "node:path";

import { defineConfig } from "@rstest/core";

// Jest's moduleNameMapper stubbed CSS and binary assets. Rstest tries to build
// them: CSS modules use `composes ... from "style"` with build-specific
// resolution Rstest's CSS loader can't satisfy, and asset imports like
// `assets/img/x.svg` resolve to paths only the app build knows. We reproduce
// the Jest behaviour by replacing those modules before any loader/resolver
// runs, via NormalModuleReplacementPlugin (rewrites the request in
// `beforeResolve`).
const mock = (p: string) => path.resolve(process.cwd(), p);
const STYLE_MOCK = mock("frontend/test/__mocks__/styleMock.js");
const FILE_MOCK = mock("frontend/test/__mocks__/fileMock.js");
const SVG_MOCK = mock("frontend/test/__mocks__/svgMock.tsx");

// jest moduleNameMapper asset extension list
const ASSET_RE =
  /\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)(\?.*)?$/;

// Migrated from jest.config.js. The "core" project only for now — the "sdk"
// and "lint-rules" Jest projects are still pending migration and excluded here.
export default defineConfig({
  name: "core",

  // jest testMatch, minus the <rootDir>/ prefix
  include: ["**/*.unit.spec.{js,jsx,ts,tsx}"],

  // jest testPathIgnorePatterns + modulePathIgnorePatterns, as globs
  exclude: [
    "**/node_modules/**",
    "**/*.tz.unit.spec.{js,jsx,ts,tsx}",
    "release/**",
    "target/cljs_release/**",
    "resources/frontend_client/**",
    "frontend/src/embedding-sdk-bundle/**",
    "frontend/src/embedding-sdk-shared/**",
    "enterprise/frontend/src/embedding-sdk-package/**",
    "enterprise/frontend/src/embedding-sdk-ee/**",
    "enterprise/frontend/src/custom-viz/**",
    "frontend/lint/tests/**",
  ],

  // Tests rely on global describe/it/expect and (after the codemod) global rstest
  globals: true,
  // jsdom, pinned to jest-environment-jsdom's default origin. Rstest's jsdom
  // defaults to http://localhost:3000; tests that resolve relative URLs against
  // window.location expect Jest's bare http://localhost/.
  testEnvironment: { name: "jsdom", options: { url: "http://localhost/" } },
  testTimeout: 30000,

  // Jest never failed an empty `describe` block (literal TODO placeholders, or
  // data-driven `describe`s whose `forEach` source array is empty). Rstest
  // reports "No test found in suite" for those unless passWithNoTests is set —
  // the same flag also gates per-suite empties, not just an empty overall run.
  passWithNoTests: true,

  // jest setupFiles + setupFilesAfterEnv collapse into a single ordered list
  setupFiles: [
    "./frontend/test/jest-setup.js",
    "./frontend/test/metabase-bootstrap.js",
    "./frontend/test/register-visualizations.js",
    "./frontend/test/jest-setup-env.js",
  ],

  // 0.10.0 worker_threads pool (default is "forks")
  pool: {
    type: "threads",
    maxWorkers: 4,
  },

  // jest moduleNameMapper. Prefix/path aliases that have no tsconfig `paths`
  // entry. CSS/asset stubs are dropped — Rstest handles those natively.
  resolve: {
    alias: {
      // jose's browser runtime expects a global CryptoKey jsdom lacks
      jose$: "./node_modules/jose/dist/node/cjs/index.js",
      "csv-parse/browser/esm/sync":
        "./node_modules/csv-parse/dist/cjs/sync.cjs",
      "csv-stringify/browser/esm/sync":
        "./node_modules/csv-stringify/dist/cjs/sync.cjs",
      // ee/sdk plugin entry points stubbed out of the core app bundle
      "sdk-ee-plugins": "./frontend/src/metabase/plugins/noop.ts",
      "sdk-iframe-embedding-ee-plugins": "./frontend/src/metabase/utils/noop.ts",
      "ee-plugins": "./frontend/src/metabase/utils/noop.ts",
      "sdk-specific-imports": "./frontend/src/metabase/utils/noop.ts",
      docs: "./docs",
    },
  },

  tools: {
    // Mirror the app build's swc-loader (rspack.main.config.js):
    //  - JSX automatic runtime (swc otherwise defaults to classic)
    //  - @swc/plugin-emotion for Emotion component selectors / styled APIs
    //  - loose mode, matching the app build
    swc: {
      jsc: {
        loose: true,
        transform: { react: { runtime: "automatic" } },
        experimental: {
          // Aliased to @swc/plugin-emotion@14.9.0: SWC wasm plugins are
          // version-locked to swc_core, and Rstest's bundled rspack uses a
          // newer swc_core than the app build's @rspack/core@1.5.8 (which
          // pins @swc/plugin-emotion@11.1.0).
          plugins: [["swc-plugin-emotion-rstest", {}]],
        },
      },
    },
    rspack: (config: any, { rspack }: any) => {
      // Markdown docs are imported as raw text (the app build treats them as
      // `asset/source`); without a rule rspack parses them as JS and fails.
      config.module ??= {};
      config.module.rules ??= [];
      config.module.rules.push({ test: /\.md$/, type: "asset/source" });

      config.plugins ??= [];
      config.plugins.push(
        // svg?component / svg?source resolve to a literal "svg" so JSX
        // `<Icon />` renders an <svg> host element — must precede ASSET_RE.
        new rspack.NormalModuleReplacementPlugin(
          /\.svg\?(component|source)/,
          SVG_MOCK,
        ),
        new rspack.NormalModuleReplacementPlugin(
          /\.(css|less)(\?.*)?$/,
          STYLE_MOCK,
        ),
        new rspack.NormalModuleReplacementPlugin(ASSET_RE, FILE_MOCK),
      );
    },
  },

  coverage: {
    include: [
      "frontend/src/**/*.{js,jsx,ts,tsx}",
      "enterprise/frontend/src/**/*.{js,jsx,ts,tsx}",
    ],
    exclude: [
      "**/*.styled.{js,jsx,ts,tsx}",
      "**/*.story.{js,jsx,ts,tsx}",
      "**/*.info.{js,jsx,ts,tsx}",
      "**/*.unit.spec.{js,jsx,ts,tsx}",
      "**/node_modules/**",
      "frontend/src/metabase/visualizations/lib/errors.js",
      "target/cljs_dev/**",
      "target/cljs_release/**",
      "frontend/test/**",
    ],
    reportsDirectory: "./coverage",
  },
});

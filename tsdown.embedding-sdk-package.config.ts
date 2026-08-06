import { defineConfig } from "tsdown";

/**
 * Generates the rolled-up type declarations for @metabase/embedding-sdk-react.
 *
 * Only the d.ts output is produced here (emitDtsOnly); the runtime JS is still
 * built by rspack.embedding-sdk-package.config.js. This replaces the old chain
 * of whole-tree tsc emit, alias fixups, and api-extractor rollup.
 */

const PACKAGE_DIR = "./enterprise/frontend/src/embedding-sdk-package";

const ENTRY_POINTS = [
  "index",
  "data-app",
  "data-app-dev",
  "data-app-dev.config",
];

// npm packages must stay external imports in the rolled-up d.ts: consumers
// resolve them from their own node_modules, and typedoc maps some of them
// (e.g. @mantine/core) to external documentation links. Phantom packages that
// are not externalized get inlined into the rollup instead.
const EXTERNAL = [
  /^react($|\/)/,
  /^react-dom($|\/)/,
  /^@mantine\//,
  /^@reduxjs\//,
  /^redux($|\/)/,
  /^react-redux/,
  /^echarts/,
  /^dayjs/,
  /^moment/,
  /^underscore/,
  /^@emotion\//,
  /^@tiptap\//,
  /^prosemirror-/,
  /^orderedmap/,
  /^history($|\/)/,
  /^react-router/,
  // Reached from data-app-dev.config.ts. Inlining vite drags in its nested
  // postcss and esbuild copies, whose declarations fail to resolve.
  /^vite($|\/)/,
  /^postcss($|\/)/,
  /^esbuild($|\/)/,
  /^immutable($|\/)/,
];

// The entry points share a lot of types, so rolldown hoists them into a few
// chunk files next to the four declarations. Consumers only ever name the four
// entry points, which import the chunks relatively.
// eslint-disable-next-line import/no-default-export
export default defineConfig([
  {
    entry: Object.fromEntries(
      ENTRY_POINTS.map((name) => [name, `${PACKAGE_DIR}/${name}.ts`]),
    ),
    outDir: "./resources/embedding-sdk/dist",
    // The rspack bundles are already in outDir when this runs.
    clean: false,
    outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
    external: EXTERNAL,
    // Drop bare side-effect imports (`import "@mantine/dates"`) from the
    // rollup: they come from ambient declaration files that only matter at
    // emit time, and consumers may not have those packages installed. The
    // published declarations never carried them.
    treeshake: {
      moduleSideEffects: false,
    },
    dts: {
      emitDtsOnly: true,
      tsconfig: "./tsconfig.sdk-dts.json",
      resolver: "tsc",
      // Native TypeScript compiler already pinned in the repo as typescript7.
      tsgo: { path: "./node_modules/typescript7/bin/tsc" },
    },
  },
]);

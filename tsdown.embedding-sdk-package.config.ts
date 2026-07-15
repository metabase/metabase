import { defineConfig } from "tsdown";

/**
 * Generates the rolled-up type declarations for @metabase/embedding-sdk-react.
 *
 * Only the d.ts output is produced here (emitDtsOnly); the runtime JS is still
 * built by rspack.embedding-sdk-package.config.js. Declarations are emitted
 * with the native TypeScript compiler (tsgo) and bundled into a single file,
 * which replaces the old chain of whole-tree tsc emit, alias fixups, and
 * api-extractor rollup.
 *
 * Requires target/cljs_release to exist (built by build-release:cljs) so that
 * `cljs/*` imports resolve during declaration emit.
 */
// eslint-disable-next-line import/no-default-export
export default defineConfig({
  entry: {
    index: "./enterprise/frontend/src/embedding-sdk-package/index.ts",
  },
  outDir: "./resources/embedding-sdk/dist",
  // The rspack bundles are already in outDir when this runs.
  clean: false,
  // npm packages must stay external imports in the rolled-up d.ts: consumers
  // resolve them from their own node_modules, and typedoc maps some of them
  // (e.g. @mantine/core) to external documentation links. Phantom packages
  // that are not externalized get inlined into the rollup instead.
  external: [
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
  ],
  // Drop bare side-effect imports (`import "@mantine/dates"`) from the rollup:
  // they come from ambient declaration files that only matter at emit time,
  // and consumers may not have those packages installed. The published
  // declarations never carried them.
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
});

import path from "path";

import glob from "glob";

import { updateChunkContentAndSourceMap } from "./update-chunk-content-and-source-map.mjs";

const REQUIRE_CALL_REGEXP =
  /return require\.apply\s*\(\s*this\s*,\s*arguments\s*\)/g;

/**
 * Removes the `require.apply(this, arguments)` call in the `__require` helper
 * The `require.apply(this, arguments)` call in the `__require` function triggers warnings in bundlers on host apps side.
 * We should not have calls of `__require` helper at runtime, because of `commonjs` esbuild plugin, but esbuild still adds the helper.
 * There's no native ability to disable it completely via `esbuild` config.
 */
export const removeRequireCall = async ({ buildPath }) => {
  await glob("./**/*.{js,mjs,cjs}", { cwd: buildPath }, (err, files) => {
    files.forEach((file) => {
      updateChunkContentAndSourceMap(path.join(buildPath, file), (content) =>
        content.replace(REQUIRE_CALL_REGEXP, "{}"),
      );
    });
  });
};

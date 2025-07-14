/* eslint-disable no-undef */
import path from "path";

import { minimatch } from "minimatch";

import { enhancedResolve } from "../utils/enhanced-resolve.mjs";

/**
 * We have to define side-effects for the SDK when using `esbuild`, but we completely have to ignore them in all other cases:
 *  - Main App build
 *  - SDK build via webpack
 *
 * This requirement prevents the usage of the `sideEffects` field in the package.json.
 *
 * This plugin mimics the `sideEffects` checking mechanism using `esbuild` API:
 * for each `importer` that is in the `sideEffects` list we mark all its imports as `sideEffects: true`
 */
export const sideEffectsPlugin = ({ basePath, sideEffects }) => ({
  name: "side-effects",
  setup(build) {
    build.onResolve(
      { filter: /.*/ },
      async ({ importer, resolveDir, path: importPath }) => {
        const resolvedPath = enhancedResolve(resolveDir, importPath, {
          resolveNodeModules: false,
        });

        if (!resolvedPath) {
          return;
        }

        const relativeImporter = "./" + path.relative(basePath, importer);

        const isSideEffectPath = sideEffects.some((sideEffectPath) =>
          minimatch(relativeImporter, sideEffectPath),
        );

        return {
          path: resolvedPath,
          sideEffects: isSideEffectPath,
        };
      },
    );

    build.onEnd((result) => {
      if (!result.warnings.length) {
        return;
      }

      const sideEffectWarnings = result.warnings.filter((warning) =>
        warning.text.includes("Ignoring this import because"),
      );

      if (!sideEffectWarnings.length) {
        return;
      }

      const errorMessage = sideEffectWarnings
        .map((warning) => {
          const {
            location: { file },
          } = warning;

          return `Found unregistered side-effect import in ${file}. Add it to the \`sideEffects\` array of the \`sideEffectsPlugin\` plugin.`;
        })
        .join("\n\n");

      throw new Error(errorMessage);
    });
  },
});

/* eslint-disable no-undef */
import { minimatch } from "minimatch";
import path from "path";

/**
 * We have to define side-effects for the SDK when using `esbuild`, but we completely have to ignore them in all other cases:
 *  - Main App build
 *  - SDK build via webpack
 *
 * This requirement prevents the usage of the `sideEffects` field in the package.json.
 *
 * This plugin mimics the `sideEffects` checking mechanism using `esbuild` API.
 */
export const sideEffectsPlugin = ({ cwd, sideEffects }) => ({
  name: "no-side-effects",
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      const importer = args.importer;
      const relativeImporter = "./" + path.relative(cwd, importer);

      if (args.pluginData) {
        // Ignore this if we called ourselves
        return;
      }

      const { path: argsPath, ...rest } = args;

      // Avoid infinite recursion
      rest.pluginData = true;

      const result = await build.resolve(argsPath, rest);

      const isSideEffectPath = sideEffects.some((sideEffectPath) =>
        minimatch(relativeImporter, sideEffectPath),
      );

      result.sideEffects = isSideEffectPath;

      return result;
    });

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

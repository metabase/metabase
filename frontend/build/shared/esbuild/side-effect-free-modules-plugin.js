/* eslint-env node */

const path = require("path");

const {
  SCRIPT_FILE_PATTERN,
  SIDE_EFFECT_FREE_PATHS,
  SIDE_EFFECT_PATHS,
} = require("../rspack/side-effect-free-modules");

const RESOLVED_BY_THIS_PLUGIN = "side-effect-free-modules";

const isUnderSideEffectFreePath = (candidate) =>
  SIDE_EFFECT_FREE_PATHS.some((dir) => (candidate + path.sep).startsWith(dir));

const isSideEffectFreeFile = (file) =>
  SCRIPT_FILE_PATTERN.test(file) &&
  SIDE_EFFECT_FREE_PATHS.some((dir) => file.startsWith(dir)) &&
  !SIDE_EFFECT_PATHS.includes(file);

// Applies the SIDE_EFFECT_FREE_PATHS declarations to esbuild, which has no module.rules:
// imports that resolve into a declared directory come back marked sideEffects: false,
// so esbuild can drop the modules behind a barrel whose bindings are unused.
const sideEffectFreeModulesPlugin = {
  name: "side-effect-free-modules",
  setup(build) {
    build.onResolve({ filter: /^(?:metabase\/|\.{1,2}\/)/ }, async (args) => {
      // build.resolve below re-enters this callback, so the recursive pass returns to it.
      if (args.pluginData === RESOLVED_BY_THIS_PLUGIN) {
        return null;
      }
      if (args.path.startsWith(".")) {
        const candidate = path.resolve(args.resolveDir, args.path);
        if (!isUnderSideEffectFreePath(candidate)) {
          return null;
        }
      }
      const resolved = await build.resolve(args.path, {
        kind: args.kind,
        importer: args.importer,
        resolveDir: args.resolveDir,
        pluginData: RESOLVED_BY_THIS_PLUGIN,
      });
      if (resolved.errors.length > 0 || !isSideEffectFreeFile(resolved.path)) {
        return null;
      }
      return { ...resolved, sideEffects: false };
    });
  },
};

module.exports = { sideEffectFreeModulesPlugin };

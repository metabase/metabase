const path = require("path");

const {
  SCRIPT_FILE_PATTERN,
  SIDE_EFFECT_FREE_PATHS,
  SIDE_EFFECT_PATHS,
} = require("../rspack/side-effect-free-modules");

const PLUGIN_NAME = "side-effect-free-modules";

// A rough check for a relative import, made before the specifier is resolved.
// The candidate has no extension yet, so it can say "definitely outside" but never "inside".
const mayResolveIntoDeclaredDir = (candidate) =>
  SIDE_EFFECT_FREE_PATHS.some((dir) => (candidate + path.sep).startsWith(dir));

const isDeclaredSideEffectFree = (file) =>
  SCRIPT_FILE_PATTERN.test(file) &&
  SIDE_EFFECT_FREE_PATHS.some((dir) => file.startsWith(dir)) &&
  !SIDE_EFFECT_PATHS.some((exception) => file.startsWith(exception));

// esbuild has no module.rules, so this plugin applies the declarations at resolve time:
// an import that lands in a declared directory comes back marked sideEffects: false,
// and esbuild drops the module when nothing uses its bindings.
const sideEffectFreeModulesPlugin = {
  name: PLUGIN_NAME,
  setup(build) {
    // Every declared directory lives under frontend/src/metabase,
    // so the only specifiers that can reach one are the metabase/ alias and relative paths.
    build.onResolve({ filter: /^(?:metabase\/|\.{1,2}\/)/ }, async (args) => {
      // build.resolve runs every onResolve callback again, this one included.
      // The marker makes the inner pass fall through to esbuild's own resolution.
      if (args.pluginData === PLUGIN_NAME) {
        return null;
      }
      // Nearly every import in a bundle is relative, and nearly none lands in a declared directory.
      // The rough check turns those away without paying for a resolve.
      if (args.path.startsWith(".")) {
        const candidate = path.resolve(args.resolveDir, args.path);
        if (!mayResolveIntoDeclaredDir(candidate)) {
          return null;
        }
      }
      const resolved = await build.resolve(args.path, {
        kind: args.kind,
        importer: args.importer,
        resolveDir: args.resolveDir,
        pluginData: PLUGIN_NAME,
      });
      // A specifier the resolver rejects is left for the normal pass, which reports the error.
      if (
        resolved.errors.length > 0 ||
        !isDeclaredSideEffectFree(resolved.path)
      ) {
        return null;
      }
      return { ...resolved, sideEffects: false };
    });
  },
};

module.exports = { sideEffectFreeModulesPlugin };

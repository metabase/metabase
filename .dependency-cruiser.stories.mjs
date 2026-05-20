/**
 * Dep-cruiser config for finding affected story files.
 * Used by scripts/affected-stories.mjs with the --affected flag.
 *
 * Differences from main config:
 * - No forbidden rules (we only need the dependency graph)
 * - Broader includeOnly (all of frontend/src/)
 * - Stories are NOT excluded (they are what we want to find)
 */

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [],

  options: {
    cache: {
      folder: "node_modules/.cache/dependency-cruiser-stories",
      strategy: "content",
    },
    doNotFollow: {
      path: "node_modules",
    },
    includeOnly: {
      path: "^frontend/src/",
    },
    exclude: {
      path: ["(^|/)e2e/", "(^|/)test/"],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};

// dependency-cruiser config for the actual frontend import graph (what's
// imported, vs the *allowed* edges in module-boundaries.mjs). Consumed by
// .github/scripts/create-test-plan.ts.
//
//   bunx depcruise frontend/src enterprise/frontend/src \
//     --config .dependency-cruiser.cjs --output-type json > dependency-graph.json

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  options: {
    // Keep only edges between our own source files (drops node_modules etc.),
    // which keeps the JSON small.
    includeOnly: "^(frontend/src|enterprise/frontend/src)/",

    doNotFollow: { path: "node_modules" },

    // Resolve the `"*": ["./frontend/src/*", ...]` aliases so bare imports like
    // `metabase/lib/foo` map back to a real file.
    tsConfig: { fileName: "tsconfig.json" },

    // Keep type-only imports: a type-only dependent still breaks on a type change.
    tsPreCompilationDeps: true,

    moduleSystems: ["es6", "cjs", "tsd"],

    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
    },
  },
};

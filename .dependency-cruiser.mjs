/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    // --- Circular dependencies ---
    {
      name: "no-circular",
      comment: "No circular dependencies allowed between modules",
      severity: "error",
      from: {},
      to: { circular: true },
    },

    // --- Basic tier: can only import from lib (not shared/feature/app) ---
    {
      name: "no-basic-to-shared",
      comment: "Basic modules (ui, api) should not import from shared modules",
      severity: "error",
      from: { path: "^frontend/src/metabase/(ui|api)/" },
      to: { path: "^frontend/src/metabase/(common|querying|visualizations)/" },
    },
    {
      name: "no-basic-to-feature",
      comment: "Basic modules should not import from feature modules",
      severity: "error",
      from: { path: "^frontend/src/metabase/(ui|api)/" },
      to: {
        path: "^frontend/src/metabase/(dashboard|query_builder|admin|reference)/",
      },
    },
    {
      name: "no-basic-to-app",
      comment: "Basic modules should not import from app modules",
      severity: "error",
      from: { path: "^frontend/src/metabase/(ui|api)/" },
      to: { path: "^frontend/src/metabase/(app|home|nav)/" },
    },

    // --- Lib tier (types, lib): cannot import from basic/shared/feature/app ---
    {
      name: "no-lib-to-basic",
      comment: "Lib modules should not import from basic modules",
      severity: "error",
      from: { path: "^frontend/src/(metabase-types|metabase/lib)/" },
      to: { path: "^frontend/src/(metabase-lib|metabase/(ui|api))/" },
    },
    // Exception: lib can import from mlv2 (uncomment to re-enable)
    // {
    //   name: "no-lib-to-basic",
    //   comment: "Types should not import from basic modules",
    //   severity: "error",
    //   from: { path: "^frontend/src/metabase-types/" },
    //   to: { path: "^frontend/src/(metabase-lib|metabase/(ui|api))/" },
    // },
    // {
    //   name: "no-lib-to-basic",
    //   comment: "Lib can import from mlv2 but not ui or api",
    //   severity: "error",
    //   from: { path: "^frontend/src/metabase/lib/" },
    //   to: { path: "^frontend/src/metabase/(ui|api)/" },
    // },

    {
      name: "no-lib-to-shared",
      comment: "Lib modules should not import from shared modules",
      severity: "error",
      from: { path: "^frontend/src/(metabase-types|metabase/lib)/" },
      to: { path: "^frontend/src/metabase/(common|querying|visualizations)/" },
    },
    {
      name: "no-lib-to-feature",
      comment: "Lib modules should not import from feature modules",
      severity: "error",
      from: { path: "^frontend/src/(metabase-types|metabase/lib)/" },
      to: { path: "^frontend/src/metabase/(dashboard|query_builder|admin|reference)/" },
    },
    {
      name: "no-lib-to-app",
      comment: "Lib modules should not import from app modules",
      severity: "error",
      from: { path: "^frontend/src/(metabase-types|metabase/lib)/" },
      to: { path: "^frontend/src/metabase/(app|home|nav)/" },
    },

    // --- Shared tier: cannot import from feature or app ---
    {
      name: "no-shared-to-feature",
      comment: "Shared modules should not import from feature modules",
      severity: "error",
      from: { path: "^frontend/src/metabase/(common|querying|visualizations)/" },
      to: { path: "^frontend/src/metabase/(dashboard|query_builder|admin|reference)/" },
    },
    // Exception: querying can import from query_builder (uncomment to re-enable)
    // {
    //   name: "no-shared-to-feature",
    //   comment: "Querying can import from query_builder but not other features",
    //   severity: "error",
    //   from: { path: "^frontend/src/metabase/(common|visualizations)/" },
    //   to: { path: "^frontend/src/metabase/(dashboard|query_builder|admin|reference)/" },
    // },
    // {
    //   name: "no-shared-to-feature",
    //   comment: "Querying can import from query_builder but not other features",
    //   severity: "error",
    //   from: { path: "^frontend/src/metabase/querying/" },
    //   to: { path: "^frontend/src/metabase/(dashboard|admin|reference)/" },
    // },
    {
      name: "no-shared-to-app",
      comment: "Shared modules should not import from app modules",
      severity: "error",
      from: { path: "^frontend/src/metabase/(common|querying|visualizations)/" },
      to: { path: "^frontend/src/metabase/(app|home|nav)/" },
    },

    // --- Feature tier: cannot import from other features or app ---
    {
      name: "no-feature-to-feature",
      comment: "Feature modules should not import from other feature modules",
      severity: "error",
      from: { path: "^frontend/src/metabase/(dashboard|query_builder|admin|reference)/" },
      to: {
        path: "^frontend/src/metabase/(dashboard|query_builder|admin|reference)/",
        pathNot: "^frontend/src/metabase/$1/",
      },
    },
    {
      name: "no-feature-to-app",
      comment: "Feature modules should not import from app modules",
      severity: "error",
      from: {
        path: "^frontend/src/metabase/(dashboard|query_builder|admin|reference)/",
      },
      to: { path: "^frontend/src/metabase/(app|home|nav)/" },
    },

  ],

  options: {
    doNotFollow: {
      path: "node_modules",
    },
    includeOnly: {
      path: "^frontend/src/(metabase-types|metabase-lib|metabase/(lib|ui|api|common|querying|visualizations|dashboard|query_builder|admin|reference|home|nav))/",
    },
    exclude: {
      path: [
        "\\.(unit\\.spec|stories)\\.",
        "(^|/)e2e/",
        "(^|/)test/",
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      dot: {
        collapsePattern:
          "^frontend/src/(metabase-types|metabase-lib)/[^/]+/|^frontend/src/metabase/([^/]+)/",
        theme: {
          graph: {
            rankdir: "TB",
            splines: "ortho",
          },
          modules: [
            {
              criteria: { source: "^frontend/src/metabase-types/" },
              attributes: {
                fillcolor: "#e8f5e9",
                label: "types",
              },
            },
            {
              criteria: { source: "^frontend/src/metabase-lib/" },
              attributes: {
                fillcolor: "#e3f2fd",
                label: "mlv2",
              },
            },
            {
              criteria: { source: "^frontend/src/metabase/lib/" },
              attributes: { fillcolor: "#e3f2fd" },
            },
            {
              criteria: { source: "^frontend/src/metabase/ui/" },
              attributes: { fillcolor: "#e3f2fd" },
            },
            {
              criteria: { source: "^frontend/src/metabase/api/" },
              attributes: { fillcolor: "#e3f2fd" },
            },
            {
              criteria: { source: "^frontend/src/metabase/common/" },
              attributes: { fillcolor: "#fff3e0" },
            },
            {
              criteria: { source: "^frontend/src/metabase/querying/" },
              attributes: { fillcolor: "#fff3e0" },
            },
            {
              criteria: { source: "^frontend/src/metabase/visualizations/" },
              attributes: { fillcolor: "#fff3e0" },
            },
            {
              criteria: { source: "^frontend/src/metabase/(dashboard|query_builder|admin|reference)/" },
              attributes: { fillcolor: "#fce4ec" },
            },
            {
              criteria: { source: "^frontend/src/metabase/(app|home|nav)/" },
              attributes: { fillcolor: "#f3e5f5" },
            },
          ],
          dependencies: [
            {
              criteria: { "rules[0].severity": "error" },
              attributes: { color: "red", fontcolor: "red" },
            },
          ],
        },
      },
    },
  },
};

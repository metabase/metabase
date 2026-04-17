const createElement = ({ type, name }) => ({
  type: `${type}/${name}`,
  pattern: `frontend/src/metabase/${name}/**`,
});

const libModules = ["lib", "css"];

const basicModules = ["ui", "api"];

const sharedModules = ["common", "querying", "visualizations"];

const featureModules = ["dashboard", "query_builder", "admin", "reference"];

const appMiscFilePaths = [
  "frontend/src/metabase/app.js",
  "frontend/src/metabase/app-embed-sdk.tsx",
  "frontend/src/metabase/app-main.js",
  "frontend/src/metabase/app-embed.ts",
  "frontend/src/metabase/app-public.ts",
  "frontend/src/metabase/App.tsx",
  "frontend/src/metabase/App.styled.tsx",
  "frontend/src/metabase/routes.jsx",
  "frontend/src/metabase/routes-embed.tsx",
  "frontend/src/metabase/routes-public.tsx",
  "frontend/src/metabase/AppThemeProvider.tsx",
  "frontend/src/metabase/AppColorSchemeProvider.tsx",
];

const elements = [
  { type: "lib/types", pattern: "frontend/src/metabase-types/*/**" },
  {
    type: "lib/schema",
    pattern: "frontend/src/metabase/schema.js",
    mode: "full", // matches the entire path
  },
  { type: "basic/mlv2", pattern: "frontend/src/metabase-lib/*/**" },
  ...libModules.map((name) => createElement({ type: "lib", name })),
  ...basicModules.map((name) => createElement({ type: "basic", name })),
  ...sharedModules.map((name) => createElement({ type: "shared", name })),
  ...featureModules.map((name) => createElement({ type: "feature", name })),
  {
    type: "feature/enterprise",
    pattern: "enterprise/frontend/src/metabase-enterprise/**",
    mode: "full", // matches the entire path, because enterprise is in a different directory
  },
  {
    type: "lib/env",
    pattern: "frontend/src/metabase/env.ts",
    mode: "full",
  },
  ...appMiscFilePaths.map((path) => ({
    type: "app/misc",
    pattern: path,
    mode: "full",
  })),
  { type: "shared/other", pattern: "frontend/src/*/**" },
];

const rules = [
  ...elements.map((element) => ({
    // always allow self-imports
    from: [element.type],
    allow: [element.type],
  })),
  {
    from: ["lib/*"],
    allow: ["lib/*"],
  },
  {
    from: ["basic/*"],
    allow: ["lib/*"],
    message: "Basic modules can only import from lib modules",
  },
  {
    from: ["basic/ui"],
    allow: ["lib/lib"],
  },
  {
    from: ["shared/*"],
    allow: ["lib/*", "basic/*", "shared/*"],
    message: "Shared modules cannot import from feature modules",
  },
  {
    from: ["feature/*"],
    allow: ["lib/*", "basic/*", "shared/*"],
    message: "Feature modules cannot import from other feature modules",
  },
  {
    from: ["feature/enterprise"],
    allow: ["feature/*"],
    message: "Enterprise module can import from all feature modules",
  },
  {
    from: ["app/*"],
    allow: ["lib/*", "basic/*", "shared/*", "feature/*", "app/*"],
  },
];

export { elements, rules };

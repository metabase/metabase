const createElement = ({ type, name }) => ({
  type: `${type}/${name}`,
  pattern: `frontend/src/metabase/${name}/**`,
});

const libModules = ["lib"];

const basicModules = ["ui", "api"];

const sharedModules = ["common", "querying", "visualizations"];

const featureModules = ["dashboard", "query_builder", "admin", "reference"];

const appModules = ["app", "home", "nav"];

const elements = [
  { type: "lib/types", pattern: "frontend/src/metabase-types/*/**" },
  { type: "basic/mlv2", pattern: "frontend/src/metabase-lib/*/**" },
  ...libModules.map((name) => createElement({ type: "lib", name })),
  ...basicModules.map((name) => createElement({ type: "basic", name })),
  ...sharedModules.map((name) => createElement({ type: "shared", name })),
  ...featureModules.map((name) => createElement({ type: "feature", name })),
  { type: "app/misc", pattern: "frontend/src/metabase/*.js*" },
  { type: "other", pattern: "frontend/src/*/**" },
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
    from: ["lib/lib"],
    allow: ["basic/mlv2"],
  },
  {
    from: ["basic/ui"],
    allow: ["lib/lib"],
  },
  {
    from: ["shared/querying"],
    allow: ["feature/query_builder"],
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
    from: ["app/*"],
    allow: ["*"],
  },
  {
    from: ["other"],
    allow: ["lib/*", "basic/*", "shared/*", "feature/*", "app/*", "other"],
  },
  {
    from: ["lib/*", "basic/*", "shared/*", "feature/*", "app/*"],
    allow: ["other"],
  },
];

const shouldEnforce = true; // FIXME
// process.env.CHECK_MODULE_BOUNDARIES === "true";

module.exports = shouldEnforce
  ? {
      elements,
      rules,
    }
  : {
      elements: [],
      rules: [],
    };

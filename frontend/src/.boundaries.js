const { create } = require("underscore");

const createElement = ({ type, name }) => ({
  type: `${type}/${name}`,
  pattern: `frontend/src/metabase/${name}/**`,
});

const basicModules = [
  "ui",
  "api",
  "lib",
];

const sharedModules = [
  "common",
  "querying",
  "visualizations",
  "redux",
];

const featureModules = [
  "dashboard",
  "query_builder",
  "admin",
  "reference",
];

const appModules = [
  "app",
  "home",
  "nav",
];

const elements = [
  { type: "types", pattern: "frontend/src/metabase-types/*/**" },
  { type: "basic/mlv2", pattern: "frontend/src/metabase-lib/*/**" },
  ...basicModules.map(name => createElement({ type: "basic", name })),
  ...sharedModules.map(name => createElement({ type: "shared", name })),
  ...featureModules.map(name => createElement({ type: "feature", name })),
  { type: "app/misc", pattern: "frontend/src/metabase/*.js*" },
  { type: "other", pattern: "frontend/src/*/**" },
];

const rules = [
  ...elements.map(element => ({
    // always allow self-imports
    from: [element.type],
    allow: [element.type],
  })),
  {
    from: ["basic/*"],
    allow: ["types"],
    message: "Basic modules can only import from types",
  },
  {
    from: ["shared/*"],
    allow: ["types", "basic/*", "shared/*"],
    message: "Shared modules cannot import from feature modules",
  },
  {
    from: ["feature/*"],
    allow: ["types", "basic/*", "shared/*"],
    message: "Feature modules cannot import from other feature modules",
  },
  {
    from: ["app/*"],
    allow: ["*"],
  },
  {
    from: ["other"],
    allow: ["types", "basic/*", "shared/*"],
  },
];

const shouldEnforce = true; // FIXME
// process.env.CHECK_MODULE_BOUNDARIES === "true";

module.exports = shouldEnforce ? {
  elements,
  rules,
} : {
  elements: [],
  rules: [],
};

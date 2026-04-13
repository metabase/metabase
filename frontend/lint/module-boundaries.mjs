const createElement = ({
  type,
  name,
  pattern,
  mode,
  enforceOutgoing = false,
}) => ({
  type: `${type}/${name}`,
  pattern: pattern ?? `frontend/src/metabase/${name}/**`,
  ...(mode && { mode }),
  enforceOutgoing,
});

const elements = [
  // lib
  createElement({
    type: "lib",
    name: "types",
    pattern: "frontend/src/metabase-types/*/**",
  }),
  createElement({
    type: "lib",
    name: "schema",
    pattern: "frontend/src/metabase/schema.js",
    mode: "full",
  }),
  createElement({ type: "lib", name: "lib" }),
  createElement({ type: "lib", name: "css" }),
  createElement({
    type: "lib",
    name: "env",
    pattern: "frontend/src/metabase/env.ts",
    mode: "full",
  }),
  // basic
  createElement({
    type: "basic",
    name: "mlv2",
    pattern: "frontend/src/metabase-lib/*/**",
  }),
  createElement({ type: "basic", name: "ui" }),
  createElement({ type: "basic", name: "api" }),
  // shared
  createElement({ type: "shared", name: "common" }),
  createElement({ type: "shared", name: "querying" }),
  createElement({ type: "shared", name: "visualizations" }),
  // feature
  createElement({ type: "feature", name: "dashboard" }),
  createElement({
    type: "feature",
    name: "query_builder",
    enforceOutgoing: true,
  }),
  createElement({ type: "feature", name: "admin" }),
  createElement({ type: "feature", name: "reference" }),
  createElement({
    type: "feature",
    name: "enterprise",
    pattern: "enterprise/frontend/src/metabase-enterprise/**",
    mode: "full",
  }),
  // app
  ...[
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
  ].map((path) =>
    createElement({ type: "app", name: "misc", pattern: path, mode: "full" }),
  ),
  // catch-all for unmoduled files - must be last
  createElement({
    type: "shared",
    name: "other",
    pattern: "frontend/src/*/**",
  }),
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

// Build enforcedRules: only enforce boundaries for modules with enforceOutgoing: true.
// Non-enforced modules get a blanket allow-all so they pass without errors.
const enforcedElementTypes = new Set(
  elements.filter((el) => el.enforceOutgoing).map((el) => el.type),
);

const getEnforcedTypesForPattern = (pattern) => {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);
    return [...enforcedElementTypes].filter((type) => type.startsWith(prefix));
  }
  return enforcedElementTypes.has(pattern) ? [pattern] : [];
};

const nonEnforcedTypes = [
  ...new Set(elements.filter((el) => !el.enforceOutgoing).map((el) => el.type)),
];

const enforcedRules = [
  ...rules
    .map((rule) => {
      const enforcedFromTypes = rule.from.flatMap(getEnforcedTypesForPattern);
      if (enforcedFromTypes.length === 0) {
        return null;
      }
      return { ...rule, from: enforcedFromTypes };
    })
    .filter(Boolean),
  ...(nonEnforcedTypes.length > 0
    ? [
        {
          from: nonEnforcedTypes,
          allow: ["lib/*", "basic/*", "shared/*", "feature/*", "app/*"],
        },
      ]
    : []),
];

export { elements, rules, enforcedRules };

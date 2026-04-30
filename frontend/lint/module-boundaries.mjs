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
  createElement({ type: "lib", name: "utils" }),
  createElement({ type: "lib", name: "analytics", enforceOutgoing: true }),
  createElement({ type: "lib", name: "css", enforceOutgoing: true }),
  createElement({
    type: "lib",
    name: "env",
    pattern: "frontend/src/metabase/env.ts",
    mode: "full",
    enforceOutgoing: true,
  }),

  // mlv1/mlv2 need to be in this order
  // for precedence
  createElement({
    type: "basic",
    name: "mlv1",
    pattern: "frontend/src/metabase-lib/v1/**",
  }),
  createElement({
    type: "lib",
    name: "mlv2",
    pattern: "frontend/src/metabase-lib/**",
    enforceOutgoing: true,
  }),

  // basic
  createElement({ type: "basic", name: "ui", enforceOutgoing: true }),
  createElement({ type: "shared", name: "api", enforceOutgoing: true }),
  // shared
  createElement({ type: "shared", name: "common", enforceOutgoing: true }),
  createElement({ type: "shared", name: "palette", enforceOutgoing: true }),
  createElement({ type: "shared", name: "querying" }),
  createElement({ type: "shared", name: "visualizations" }),
  createElement({ type: "shared", name: "account", enforceOutgoing: true }),
  createElement({ type: "shared", name: "archive", enforceOutgoing: true }),
  createElement({ type: "shared", name: "auth", enforceOutgoing: true }),
  createElement({ type: "shared", name: "browse", enforceOutgoing: true }),
  createElement({ type: "shared", name: "collections", enforceOutgoing: true }),
  createElement({ type: "shared", name: "comments", enforceOutgoing: true }),
  createElement({ type: "shared", name: "data-grid", enforceOutgoing: true }),
  createElement({ type: "shared", name: "databases", enforceOutgoing: true }),
  createElement({ type: "shared", name: "history", enforceOutgoing: true }),
  createElement({ type: "shared", name: "hoc", enforceOutgoing: true }),
  createElement({ type: "shared", name: "hooks", enforceOutgoing: true }),
  createElement({ type: "shared", name: "i18n", enforceOutgoing: true }),
  createElement({ type: "shared", name: "metadata", enforceOutgoing: true }),
  createElement({
    type: "shared",
    name: "metrics-viewer",
    enforceOutgoing: true,
  }),
  createElement({ type: "shared", name: "new", enforceOutgoing: true }),
  createElement({ type: "shared", name: "pulse", enforceOutgoing: true }),
  createElement({ type: "shared", name: "questions", enforceOutgoing: true }),
  createElement({ type: "shared", name: "router", enforceOutgoing: true }),
  createElement({ type: "shared", name: "search", enforceOutgoing: true }),
  createElement({ type: "shared", name: "status", enforceOutgoing: true }),
  createElement({
    type: "shared",
    name: "styled-components",
    enforceOutgoing: true,
  }),
  createElement({ type: "shared", name: "timelines", enforceOutgoing: true }),
  createElement({
    type: "shared",
    name: "embedding-sdk-shared",
    pattern: "frontend/src/embedding-sdk-shared/**",
    enforceOutgoing: true,
  }),
  createElement({
    type: "shared",
    name: "metabase-shared",
    pattern: "frontend/src/metabase-shared/**",
    enforceOutgoing: true,
  }),
  createElement({
    type: "shared",
    name: "types",
    pattern: "frontend/src/types/**",
    enforceOutgoing: true,
  }),
  createElement({
    type: "shared",
    name: "embedding-ee",
    pattern: "enterprise/frontend/src/embedding/**",
    enforceOutgoing: true,
  }),
  createElement({
    type: "shared",
    name: "embedding-sdk-package",
    pattern: "enterprise/frontend/src/embedding-sdk-package/**",
    enforceOutgoing: true,
  }),
  // feature
  createElement({ type: "feature", name: "dashboard" }),
  createElement({
    type: "feature",
    name: "query_builder",
    enforceOutgoing: true,
  }),
  createElement({ type: "feature", name: "admin", enforceOutgoing: true }),
  createElement({ type: "feature", name: "reference", enforceOutgoing: true }),
  createElement({
    type: "feature",
    name: "enterprise",
    pattern: "enterprise/frontend/src/metabase-enterprise/**",
    mode: "full",
    enforceOutgoing: true,
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
    "frontend/src/metabase/AppKBarProvider.tsx",
    "frontend/src/metabase/reducers-main.ts",
    "frontend/src/metabase/routes.jsx",
    "frontend/src/metabase/routes-embed.tsx",
    "frontend/src/metabase/routes-public.tsx",
    "frontend/src/metabase/AppThemeProvider.tsx",
    "frontend/src/metabase/AppColorSchemeProvider.tsx",
  ].map((path) =>
    createElement({
      type: "app",
      name: "misc",
      pattern: path,
      mode: "full",
      enforceOutgoing: true,
    }),
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

/**
 * Returns a subset of rules that only enforces boundaries for modules with
 * enforceOutgoing: true. Non-enforced modules get a blanket allow-all.
 */
function buildEnforcedRules(elements, rules) {
  const enforcedTypes = new Set(
    elements.filter((el) => el.enforceOutgoing).map((el) => el.type),
  );
  const nonEnforcedTypes = new Set(
    elements.filter((el) => !el.enforceOutgoing).map((el) => el.type),
  );

  // Narrows a wildcard "from" pattern (e.g. "feature/*") to only the concrete
  // types that have enforceOutgoing: true (e.g. ["feature/query_builder"]),
  // so enforced rules don't accidentally apply to non-enforced modules.
  const expandPattern = (pattern) => {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      return [...enforcedTypes].filter((type) => type.startsWith(prefix));
    }
    return enforcedTypes.has(pattern) ? [pattern] : [];
  };

  // Keep only rules whose `from` matches an enforced module, replacing
  // wildcard patterns with the concrete enforced types.
  const narrowedRules = rules.flatMap((rule) => {
    const from = rule.from.flatMap(expandPattern);
    return from.length > 0 ? [{ ...rule, from }] : [];
  });

  return [
    ...narrowedRules,
    ...(nonEnforcedTypes.size > 0
      ? [
          {
            from: [...nonEnforcedTypes],
            allow: ["lib/*", "basic/*", "shared/*", "feature/*", "app/*"],
          },
        ]
      : []),
  ];
}

const enforcedRules = buildEnforcedRules(elements, rules);

export { elements, rules, enforcedRules };

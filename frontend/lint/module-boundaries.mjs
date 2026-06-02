const createElement = ({
  type,
  name,
  pattern,
  mode,
  enforceOutgoing = true,
}) => ({
  type: `${type}/${name}`,
  pattern: pattern ?? `frontend/src/metabase/${name}/**`,
  ...(mode && { mode }),
  enforceOutgoing,
});

const elements = [
  // lib
  createElement({ type: "lib", name: "analytics" }),
  createElement({ type: "lib", name: "css" }),
  createElement({
    type: "lib",
    name: "env",
    pattern: "frontend/src/metabase/env.ts",
    mode: "full",
  }),
  createElement({
    type: "lib",
    name: "types",
    pattern: "frontend/src/metabase-types/*/**",
    enforceOutgoing: false,
  }),
  createElement({ type: "lib", name: "utils" }),

  // mlv1 (basic) and mlv2 (lib) must stay in this order: mlv1's pattern is a
  // subset of mlv2's, and the first matching element wins. This precedence
  // requirement crosses tiers, so the pair is kept together here rather than
  // sorted into the lib/basic groups.
  createElement({
    type: "basic",
    name: "mlv1",
    pattern: "frontend/src/metabase-lib/v1/**",
  }),
  createElement({
    type: "lib",
    name: "mlv2",
    pattern: "frontend/src/metabase-lib/**",
  }),

  // basic
  createElement({ type: "basic", name: "ui" }),

  // shared
  createElement({ type: "shared", name: "account" }),
  createElement({ type: "shared", name: "api" }),
  createElement({ type: "shared", name: "archive" }),
  createElement({ type: "shared", name: "auth" }),
  createElement({ type: "shared", name: "browse" }),
  createElement({ type: "shared", name: "collections" }),
  createElement({ type: "shared", name: "comments" }),
  createElement({ type: "shared", name: "common" }),
  createElement({
    type: "shared",
    name: "custom-viz",
    pattern: "enterprise/frontend/src/custom-viz/**",
  }),
  createElement({ type: "shared", name: "data-grid" }),
  createElement({ type: "shared", name: "data-studio" }),
  createElement({ type: "shared", name: "databases" }),
  createElement({ type: "shared", name: "detail-view" }),
  createElement({ type: "shared", name: "documents" }),
  createElement({ type: "shared", name: "embedding", enforceOutgoing: false }),
  createElement({
    type: "shared",
    name: "embedding-ee",
    pattern: "enterprise/frontend/src/embedding/**",
  }),
  createElement({
    type: "shared",
    name: "embedding-sdk-package",
    pattern: "enterprise/frontend/src/embedding-sdk-package/**",
  }),
  createElement({
    type: "shared",
    name: "embedding-sdk-shared",
    pattern: "frontend/src/embedding-sdk-shared/**",
  }),
  createElement({ type: "shared", name: "forms" }),
  createElement({ type: "shared", name: "history" }),
  createElement({ type: "shared", name: "hoc" }),
  createElement({ type: "shared", name: "home" }),
  createElement({ type: "shared", name: "hooks" }),
  createElement({ type: "shared", name: "i18n" }),
  createElement({
    type: "shared",
    name: "metabase-shared",
    pattern: "frontend/src/metabase-shared/**",
  }),
  createElement({ type: "shared", name: "metadata" }),
  createElement({ type: "shared", name: "metrics" }),
  createElement({ type: "shared", name: "metrics-viewer" }),
  createElement({ type: "shared", name: "models" }),
  createElement({ type: "shared", name: "new" }),
  createElement({ type: "shared", name: "palette" }),
  createElement({ type: "shared", name: "pulse" }),
  createElement({ type: "shared", name: "querying", enforceOutgoing: false }),
  createElement({ type: "shared", name: "questions" }),
  createElement({ type: "shared", name: "router" }),
  createElement({
    type: "shared",
    name: "schema",
    pattern: "frontend/src/metabase/schema.js",
    mode: "full",
    enforceOutgoing: false,
  }),
  createElement({ type: "shared", name: "search" }),
  createElement({ type: "shared", name: "setup" }),
  createElement({ type: "shared", name: "status" }),
  createElement({ type: "shared", name: "styled-components" }),
  createElement({ type: "shared", name: "timelines" }),
  createElement({ type: "shared", name: "transforms" }),
  createElement({
    type: "shared",
    name: "types",
    pattern: "frontend/src/types/**",
  }),
  createElement({ type: "shared", name: "urls" }),
  createElement({ type: "shared", name: "visualizations" }),
  createElement({ type: "shared", name: "visualizer" }),

  // feature
  createElement({ type: "feature", name: "admin" }),
  createElement({ type: "feature", name: "dashboard" }),
  createElement({
    type: "feature",
    name: "enterprise",
    pattern: "enterprise/frontend/src/metabase-enterprise/**",
    mode: "full",
  }),
  createElement({ type: "feature", name: "public" }),
  createElement({ type: "feature", name: "query_builder" }),
  createElement({ type: "feature", name: "reference" }),

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
    "frontend/src/metabase/route-guards.tsx",
    "frontend/src/metabase/routes-public.tsx",
    "frontend/src/metabase/AppThemeProvider.tsx",
    "frontend/src/metabase/AppColorSchemeProvider.tsx",
  ].map((path) =>
    createElement({
      type: "app",
      name: "misc",
      pattern: path,
      mode: "full",
    }),
  ),
  // catch-all for unmoduled files - must be last
  createElement({
    type: "shared",
    name: "other",
    pattern: "frontend/src/*/**",
    enforceOutgoing: false,
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
    from: ["feature/public"],
    allow: ["feature/*"],
    message: "Public module can import from all feature modules",
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

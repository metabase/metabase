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
  // basic
  createElement({
    type: "basic",
    name: "mlv2",
    pattern: "frontend/src/metabase-lib/*/**",
  }),
  createElement({ type: "basic", name: "ui", enforceOutgoing: true }),
  createElement({ type: "shared", name: "api" }),
  // shared
  createElement({ type: "shared", name: "common", enforceOutgoing: true }),
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

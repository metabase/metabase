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
  createElement({ type: "feature", name: "account" }),
  createElement({ type: "shared", name: "actions" }),
  createElement({ type: "shared", name: "api" }),
  createElement({ type: "shared", name: "archive" }),
  createElement({ type: "feature", name: "auth" }),
  createElement({ type: "feature", name: "browse" }),
  createElement({ type: "feature", name: "collections" }),
  createElement({ type: "shared", name: "comments" }),
  createElement({ type: "shared", name: "common" }),
  createElement({
    type: "shared",
    name: "custom-viz",
    pattern: "enterprise/frontend/src/custom-viz/**",
  }),
  createElement({ type: "shared", name: "data-grid" }),
  createElement({ type: "shared", name: "databases" }),
  createElement({ type: "shared", name: "detail-view" }),
  createElement({
    type: "shared",
    name: "embed",
    pattern: "frontend/src/embed/**",
  }),
  // embedding-iframe-sdk, embedding-iframe-sdk-setup and mcp-app must come before
  // shared/embedding: their patterns are subfolders of
  // frontend/src/metabase/embedding/, and the first matching element wins.
  createElement({
    type: "app",
    name: "embedding-iframe-sdk",
    pattern: "frontend/src/metabase/embedding/embedding-iframe-sdk/**",
  }),
  createElement({
    type: "app",
    name: "embedding-iframe-sdk-setup",
    pattern: "frontend/src/metabase/embedding/embedding-iframe-sdk-setup/**",
  }),
  createElement({
    type: "app",
    name: "mcp-app",
    pattern: "frontend/src/metabase/embedding/mcp/**",
  }),
  ...[
    "frontend/src/metabase/app-embed-mcp.tsx",
    "frontend/src/metabase/app-embed-mcp-public-path.ts",
    "frontend/src/metabase/app-embed-mcp-public-path.unit.spec.ts",
  ].map((pattern) =>
    createElement({ type: "app", name: "mcp-app", pattern, mode: "full" }),
  ),
  createElement({ type: "shared", name: "embedding" }),
  createElement({ type: "shared", name: "embedding-sdk" }),
  createElement({
    type: "app",
    name: "embedding-sdk-bundle",
    pattern: "frontend/src/embedding-sdk-bundle/**",
  }),
  createElement({
    type: "shared",
    name: "embedding-ee",
    pattern: "enterprise/frontend/src/embedding/**",
  }),
  createElement({
    type: "app",
    name: "embedding-sdk-ee",
    pattern: "enterprise/frontend/src/embedding-sdk-ee/**",
  }),
  createElement({
    type: "app",
    name: "embedding-sdk-package",
    pattern: "enterprise/frontend/src/embedding-sdk-package/**",
  }),
  // Window-global bridges between the SDK bundle and the npm package. They
  // stay shared tier (both artifacts compile them in), but their payload
  // types are owned by the bundle, hence the type-only allow rule below.
  ...[
    "frontend/src/embedding-sdk-shared/lib/ensure-metabase-provider-props-store.ts",
    "frontend/src/embedding-sdk-shared/lib/metabot-state-channel.ts",
  ].map((pattern) =>
    createElement({
      type: "shared",
      name: "embedding-sdk-window-bridge",
      pattern,
      mode: "full",
    }),
  ),
  createElement({
    type: "shared",
    name: "embedding-sdk-shared",
    pattern: "frontend/src/embedding-sdk-shared/**",
  }),
  createElement({ type: "shared", name: "forms" }),
  createElement({ type: "shared", name: "history" }),
  createElement({ type: "shared", name: "hoc" }),
  createElement({ type: "feature", name: "home" }),
  createElement({ type: "shared", name: "hooks" }),
  createElement({ type: "shared", name: "content-translation" }),
  createElement({
    type: "shared",
    name: "metabase-shared",
    pattern: "frontend/src/metabase-shared/**",
  }),
  createElement({ type: "shared", name: "metabot" }),
  createElement({ type: "shared", name: "metadata" }),
  createElement({ type: "feature", name: "models" }),
  createElement({ type: "shared", name: "monitor" }),
  createElement({ type: "shared", name: "nav" }),
  createElement({ type: "shared", name: "new" }),
  createElement({ type: "shared", name: "notifications" }),
  createElement({ type: "shared", name: "palette" }),
  createElement({ type: "shared", name: "parameters" }),
  createElement({ type: "shared", name: "plugins" }),
  createElement({ type: "shared", name: "pulse" }),
  createElement({ type: "shared", name: "querying" }),
  createElement({ type: "shared", name: "questions" }),
  createElement({ type: "shared", name: "redux" }),
  createElement({ type: "shared", name: "rich_text_editing" }),
  createElement({ type: "shared", name: "router" }),
  createElement({
    type: "shared",
    name: "schema",
    pattern: "frontend/src/metabase/schema.js",
    mode: "full",
  }),
  createElement({ type: "shared", name: "selectors" }),
  createElement({ type: "feature", name: "setup" }),
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
  // The theme editor preview renders the live embed via the app-tier EAJS
  // runtime; the edge is whitelisted via the allow rules below.
  createElement({
    type: "feature",
    name: "admin-theme-preview",
    pattern:
      "frontend/src/metabase/admin/embedding/components/ThemeEditor/ResourcePreview.tsx",
    mode: "full",
  }),
  createElement({ type: "feature", name: "admin" }),
  createElement({ type: "feature", name: "dashboard" }),
  createElement({ type: "feature", name: "data-studio" }),
  createElement({ type: "feature", name: "documents" }),
  // EE plugin-bootstrap files that only wire app-tier SDK modules into plugin
  // slots, so they're app tier, not feature/enterprise. Tagged by which embedding
  // product they belong to. Must precede the feature/enterprise element below
  // (first match wins).
  // TODO: physically move these into the embedding-sdk-ee / embedding-iframe-sdk-ee
  // folders so module == folder, instead of tagging files in metabase-enterprise.
  ...[
    "enterprise/frontend/src/metabase-enterprise/sdk-plugins.ts",
    "enterprise/frontend/src/metabase-enterprise/whitelabel/sdk-overrides.ts",
    "enterprise/frontend/src/metabase-enterprise/whitelabel/sdk-overrides.unit.spec.ts",
  ].map((pattern) =>
    createElement({
      type: "app",
      name: "embedding-sdk-ee",
      pattern,
      mode: "full",
    }),
  ),
  ...[
    "enterprise/frontend/src/metabase-enterprise/embedding_iframe_sdk/auth-manager/AuthManager.ts",
    "enterprise/frontend/src/metabase-enterprise/embedding_iframe_sdk/handle-link.ts",
    "enterprise/frontend/src/metabase-enterprise/embedding_iframe_sdk/sdk-iframe-embedding-script-ee-plugins.ts",
    "enterprise/frontend/src/metabase-enterprise/sdk-iframe-embedding-plugins.ts",
    "enterprise/frontend/src/metabase-enterprise/sdk-iframe-embedding-script-plugins.ts",
  ].map((pattern) =>
    createElement({
      type: "app",
      name: "embedding-iframe-sdk-ee",
      pattern,
      mode: "full",
    }),
  ),
  // The Near-Membrane sandbox + its ABI (globals map, factory/provider-props
  // contract). Feature tier on purpose: it's a library consumed by the app-tier
  // entries (runtime + SDK package dev preset), and the tier guarantees it only
  // reaches shared/lib — keep the sandbox's dependency surface auditable.
  createElement({
    type: "feature",
    name: "data-app-sandbox",
    pattern: "enterprise/frontend/src/metabase-enterprise/data_apps/sandbox/**",
    mode: "full",
  }),
  createElement({
    type: "app",
    name: "data-app-runtime",
    pattern: "enterprise/frontend/src/metabase-enterprise/data_apps/runtime/**",
    mode: "full",
  }),
  createElement({
    type: "feature",
    name: "enterprise",
    pattern: "enterprise/frontend/src/metabase-enterprise/**",
    mode: "full",
  }),
  createElement({ type: "feature", name: "metrics" }),
  createElement({ type: "feature", name: "metrics-viewer" }),
  createElement({ type: "feature", name: "public" }),
  createElement({ type: "feature", name: "query_builder" }),
  createElement({ type: "feature", name: "reference" }),
  createElement({ type: "feature", name: "search" }),

  // app
  ...[
    "frontend/src/metabase/app.js",
    "frontend/src/metabase/app-embed-sdk.tsx",
    "frontend/src/metabase/app-main.js",
    "frontend/src/metabase/app-embed.ts",
    "frontend/src/metabase/app-public.ts",
    "frontend/src/metabase/app-static-viz.ts",
    "frontend/src/metabase/app-static-viz-custom.ts",
    "frontend/src/metabase/AppComponent.tsx",
    "frontend/src/metabase/App.styled.tsx",
    "frontend/src/metabase/AppKBarProvider.tsx",
    "frontend/src/metabase/app/selectors.ts",
    "frontend/src/metabase/app/selectors.unit.spec.ts",
    "frontend/src/metabase/reducers-main.ts",
    "frontend/src/metabase/reducers-common.ts",
    "frontend/src/metabase/reducers-public.ts",
    "frontend/src/metabase/routes.tsx",
    "frontend/src/metabase/routes.unit.spec.tsx",
    "frontend/src/metabase/routes-embed.tsx",
    "frontend/src/metabase/LoadCurrentUser.tsx",
    "frontend/src/metabase/LoadCurrentUser.unit.spec.tsx",
    "frontend/src/metabase/routes-public.tsx",
    "frontend/src/metabase/AppThemeProvider.tsx",
    "frontend/src/metabase/AppColorSchemeProvider.tsx",
    // NewModals is used very high in the hierarchy and imports the EAJS wizard that uses EAJS (app level)
    "frontend/src/metabase/new/components/NewModals/NewModals.tsx",
    // Its spec mounts NewModals to assert menu clicks open modals, so the test is app-tier too.
    "frontend/src/metabase/common/components/NewItemMenu/NewItemMenu.unit.spec.tsx",
    // Entry points for the static-viz bundles
    "frontend/src/metabase/static-viz/index.tsx",
    "frontend/src/metabase/static-viz/index-custom.tsx",
    "frontend/src/metabase/static-viz/lib/entrypoint.ts",
    // Storybook config is a composition root: preview wires app-tier decorators.
    // Needs its own pattern because ** doesn't match dot-folders.
    "frontend/src/embedding-sdk-shared/.storybook/**",
  ].map((path) =>
    createElement({
      type: "app",
      name: "misc",
      pattern: path,
      mode: "full",
    }),
  ),
  createElement({
    type: "app",
    name: "nav",
    pattern: "frontend/src/metabase/app/nav/**",
  }),
  // static-viz must come after the app entries rather than in the
  // alphabetical shared list: its entry point (static-viz/index.tsx) is app
  // tier, and the first matching element wins.
  createElement({ type: "shared", name: "static-viz" }),

  // Loose files living directly under frontend/src/metabase that have not yet
  // been pulled into a module folder.
  ...["frontend/src/metabase/dev.ts", "frontend/src/metabase/dev-noop.ts"].map(
    (pattern) =>
      createElement({
        type: "shared",
        name: "cljs-dev-tools",
        pattern,
        mode: "full",
      }),
  ),
  createElement({
    type: "shared",
    name: "error-boundary",
    pattern: "frontend/src/metabase/ErrorBoundary.tsx",
    mode: "full",
  }),
  createElement({
    type: "shared",
    name: "routes-stable-id-aware",
    pattern: "frontend/src/metabase/routes-stable-id-aware.tsx",
    mode: "full",
  }),
  createElement({
    type: "shared",
    name: "redux-store",
    pattern: "frontend/src/metabase/store.js",
    mode: "full",
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
  // Whitelisted cross-tier edges. Keep this list short; every entry should
  // eventually be removed.
  // Window-bridge ABI: the payload shapes are owned by the bundle.
  // TODO(embedding-modules): decouple with shared contracts.
  {
    from: ["shared/embedding-sdk-window-bridge"],
    allow: ["app/embedding-sdk-bundle"],
    importKind: "type",
  },
  // Admin theme preview drives the live embed through the EAJS runtime.
  // Remove once the preview is lifted out of admin.
  {
    from: ["feature/admin-theme-preview"],
    allow: ["feature/admin", "app/embedding-iframe-sdk"],
  },
  {
    from: ["feature/admin"],
    allow: ["feature/admin-theme-preview"],
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

function getFeatureModules(els = elements) {
  return els.map((e) => e.type).filter((type) => type.startsWith("feature/"));
}

export { elements, rules, enforcedRules, getFeatureModules };

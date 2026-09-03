import { sharedRules } from "./shared-tiers.mjs";

const createElement = ({
  type,
  name,
  pattern,
  mode,
  enforceOutgoing = true,
  enforceSharedTiers = true,
  // Outside code must import the module root alias, and the module's own files must import relatively.
  // Enforced by the `metabase/enforce-module-public-api` rule via `getPublicApiModules` below.
  enforcePublicApi = false,
}) => {
  if (enforcePublicApi && (pattern || mode)) {
    // Single-file elements are their own entry point, and elements outside the
    // `metabase` alias root would need their own alias derivation.
    throw new Error(
      `enforcePublicApi requires a default folder element (frontend/src/metabase/<name>/**): ${name}`,
    );
  }
  return {
    type: `${type}/${name}`,
    pattern: pattern ?? `frontend/src/metabase/${name}/**`,
    ...(mode && { mode }),
    enforceOutgoing,
    enforceSharedTiers,
    ...(enforcePublicApi && { publicApiAlias: `metabase/${name}` }),
  };
};

const elements = [
  // lib
  createElement({ type: "lib", name: "analytics", enforcePublicApi: true }),
  createElement({ type: "lib", name: "css" }),
  createElement({ type: "lib", name: "dayjs", enforcePublicApi: true }),
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
  createElement({ type: "basic", name: "router" }),
  createElement({ type: "basic", name: "ui" }),
  createElement({
    type: "basic",
    name: "value-formatting",
    enforcePublicApi: true,
  }),
  // static-viz runs this in GraalJS, so it stays free of the React and redux side of visualizations.
  createElement({ type: "basic", name: "viz-core", enforcePublicApi: true }),

  // shared
  createElement({ type: "feature", name: "account" }),
  createElement({ type: "shared", name: "actions" }),
  createElement({ type: "shared", name: "api", enforceSharedTiers: false }),
  createElement({ type: "shared", name: "archive" }),
  createElement({ type: "feature", name: "auth" }),
  createElement({ type: "feature", name: "browse" }),
  createElement({ type: "feature", name: "collections" }),
  createElement({ type: "shared", name: "comments" }),
  ...[
    "frontend/src/metabase/common/metrics/**",
    "frontend/src/metabase/common/metrics-viewer/**",
  ].map((pattern) =>
    createElement({ type: "shared", name: "metrics-ui", pattern }),
  ),
  // Data-studio UI shared by the metrics and data-studio features and consumed
  // by shared/transforms. Only the components are carved out: they import
  // querying/nav/metabot/upsells, which must not become edges of shared/common.
  // The sibling analytics and collection utils stay in common (common files
  // import them). Untiered for now: it cannot take a sub-tier level until the
  // metabot button and the AppSwitcher are slotted out of PaneHeader, and a
  // pattern element cannot take enforcePublicApi.
  createElement({
    type: "shared",
    name: "data-studio-ui",
    pattern: "frontend/src/metabase/common/data-studio/components/**",
  }),
  createElement({
    type: "shared",
    name: "upsells",
    pattern: "frontend/src/metabase/common/components/upsells/**",
  }),
  ...[
    "frontend/src/metabase/common/search/**",
    "frontend/src/metabase/common/components/SearchResult/**",
    "frontend/src/metabase/common/components/SearchResultLink/**",
    "frontend/src/metabase/common/components/InfoText/**",
  ].map((pattern) =>
    createElement({ type: "shared", name: "search-ui", pattern }),
  ),
  createElement({ type: "shared", name: "common" }),
  createElement({
    type: "shared",
    name: "current-user",
    enforcePublicApi: true,
  }),
  createElement({
    type: "shared",
    name: "custom-viz",
    pattern: "enterprise/frontend/src/custom-viz/**",
  }),
  createElement({ type: "shared", name: "data-grid" }),
  createElement({ type: "shared", name: "databases" }),
  createElement({
    type: "shared",
    name: "detail-view",
    enforceSharedTiers: false,
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
  // stay shared tier (both artifacts compile them in) and carry their payloads
  // as opaque types; each artifact pins the concrete bundle types on its side.
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
  // Storybook config is a composition root: preview wires app-tier decorators.
  // Needs its own pattern because ** doesn't match dot-folders in the lint,
  // and must come before shared/embedding-sdk-shared: the affected-tests
  // tooling matches with `dot: true` and first-element-wins, so a later
  // position would hand these files to the shared module in the test graph.
  createElement({
    type: "app",
    name: "misc",
    pattern: "frontend/src/embedding-sdk-shared/.storybook/**",
    mode: "full",
  }),
  createElement({
    type: "shared",
    name: "embedding-sdk-shared",
    pattern: "frontend/src/embedding-sdk-shared/**",
  }),
  createElement({ type: "shared", name: "forms" }),
  createElement({ type: "shared", name: "hoc" }),
  createElement({ type: "feature", name: "home" }),
  createElement({ type: "shared", name: "hooks", enforceSharedTiers: false }),
  createElement({ type: "shared", name: "content-translation" }),
  createElement({ type: "shared", name: "metabot", enforceSharedTiers: false }),
  // The app-wide mirror of table and field metadata. Separate from
  // `shared/metadata`, which is the Semantic Layer UI: 147 files read the store,
  // 115 use the UI, and 8 do both.
  createElement({
    type: "shared",
    name: "metadata-store",
    enforcePublicApi: true,
  }),
  createElement({ type: "shared", name: "metadata" }),
  createElement({ type: "feature", name: "models" }),
  createElement({ type: "feature", name: "monitor" }),
  createElement({ type: "shared", name: "nav" }),
  createElement({ type: "shared", name: "notifications" }),
  createElement({ type: "shared", name: "palette" }),
  createElement({ type: "shared", name: "parameters" }),
  createElement({ type: "shared", name: "plugins", enforceSharedTiers: false }),
  createElement({ type: "shared", name: "pulse" }),
  createElement({
    type: "shared",
    name: "querying",
    enforceSharedTiers: false,
  }),
  createElement({ type: "shared", name: "questions" }),
  createElement({ type: "shared", name: "redux", enforceSharedTiers: false }),
  createElement({ type: "shared", name: "rich_text_editing" }),
  createElement({ type: "shared", name: "route-guards" }),
  createElement({ type: "shared", name: "selectors" }),
  createElement({ type: "shared", name: "settings", enforcePublicApi: true }),
  createElement({ type: "feature", name: "setup" }),
  createElement({ type: "shared", name: "static-viz" }),
  createElement({ type: "shared", name: "status" }),
  createElement({
    type: "shared",
    name: "styled-components",
    enforceSharedTiers: false,
  }),
  createElement({ type: "shared", name: "timelines" }),
  createElement({ type: "shared", name: "transforms" }),
  createElement({
    type: "shared",
    name: "types",
    pattern: "frontend/src/types/**",
  }),
  createElement({ type: "shared", name: "urls" }),
  createElement({
    type: "shared",
    name: "visualizations",
    enforceSharedTiers: false,
  }),
  createElement({ type: "shared", name: "visualizer" }),

  // feature
  // The theme editor previews the live embed through the app-tier EAJS
  // runtime, so the whole editor is an app-tier module. It still lives under
  // the admin folder; the pattern must come before feature/admin (first match
  // wins).
  // TODO(embedding-modules): move the folder out of admin so module == folder.
  createElement({
    type: "app",
    name: "theme-editor",
    pattern: "frontend/src/metabase/admin/embedding/components/ThemeEditor/**",
  }),
  // Route composition for the admin app. Must precede feature/admin.
  ...[
    "frontend/src/metabase/admin/routes.tsx",
    "frontend/src/metabase/admin/routes.unit.spec.tsx",
  ].map((pattern) =>
    createElement({ type: "app", name: "admin-routes", pattern, mode: "full" }),
  ),
  createElement({ type: "feature", name: "admin" }),
  createElement({ type: "feature", name: "dashboard" }),
  createElement({ type: "feature", name: "data-studio" }),
  createElement({ type: "shared", name: "documents" }),
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
  createElement({ type: "feature", name: "explorations" }),
  createElement({ type: "feature", name: "metrics" }),
  createElement({ type: "feature", name: "metrics-viewer" }),
  createElement({ type: "feature", name: "public" }),
  createElement({
    type: "feature",
    name: "query_builder",
    enforcePublicApi: true,
  }),
  createElement({ type: "feature", name: "reference" }),
  createElement({ type: "feature", name: "search" }),

  // app
  // Composition/barrel file for reducers shared among the embedding sdk and the core app
  createElement({
    type: "app",
    name: "reducers-common",
    pattern: "frontend/src/metabase/reducers-common.ts",
    mode: "full",
  }),
  ...[
    "frontend/src/metabase/app.tsx",
    "frontend/src/metabase/app-embed-sdk.tsx",
    "frontend/src/metabase/app-main.ts",
    "frontend/src/metabase/app-embed.ts",
    "frontend/src/metabase/app-public.ts",
    "frontend/src/metabase/app-static-viz.ts",
    "frontend/src/metabase/AppComponent.tsx",
    "frontend/src/metabase/App.styled.tsx",
    "frontend/src/metabase/AppKBarProvider.tsx",
    "frontend/src/metabase/app/selectors.ts",
    "frontend/src/metabase/app/selectors.unit.spec.ts",
    "frontend/src/metabase/reducers-main.ts",
    "frontend/src/metabase/reducers-public.ts",
    "frontend/src/metabase/routes.tsx",
    "frontend/src/metabase/routes.unit.spec.tsx",
    "frontend/src/metabase/routes-embed.tsx",
    "frontend/src/metabase/LoadCurrentUser.tsx",
    "frontend/src/metabase/LoadCurrentUser.unit.spec.tsx",
    "frontend/src/metabase/routes-public.tsx",
    "frontend/src/metabase/AppThemeProvider.tsx",
    "frontend/src/metabase/AppColorSchemeProvider.tsx",
    // Entry point for the static-viz bundle (server-side chart rendering in
    // GraalJS) - like app.tsx, it composes OSS + EE code for a build artifact.
    // Full-mode entries match before folder patterns, whatever the order.
    "frontend/src/metabase/static-viz/index.tsx",
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
  // NewModals is composition glue rendered at the app root, wiring in the app-tier embed wizard.
  createElement({ type: "app", name: "new" }),
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
    type: "app",
    name: "routes-stable-id-aware",
    pattern: "frontend/src/metabase/routes-stable-id-aware.tsx",
    mode: "full",
  }),
  createElement({
    type: "shared",
    name: "redux-store",
    pattern: "frontend/src/metabase/store.ts",
    mode: "full",
  }),
];

const baseRules = [
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
  // The column-vocabulary predicates (isa, column-key) live in metabase-lib/v1.
  {
    from: ["basic/value-formatting"],
    allow: ["basic/mlv1"],
  },
  // mlv1 for the column predicates, value-formatting for formatValue, ui for the colour utilities and theme types.
  {
    from: ["basic/viz-core"],
    allow: ["basic/mlv1", "basic/value-formatting", "basic/ui"],
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

// The full rule set drives the standalone `bun run module-boundaries` count.
// PR lint uses enforcedRules.
const rules = [...baseRules, ...sharedRules];

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

/**
 * Modules with enforceSharedTiers: false are dropped from the level rules,
 * which leaves them on the blanket shared -> shared allow.
 */
function buildEnforcedSharedRules(elements, rules) {
  const enforcedTypes = new Set(
    elements
      .filter((el) => el.type.startsWith("shared/") && el.enforceSharedTiers)
      .map((el) => el.type),
  );
  return rules.flatMap((rule) => {
    const from = rule.from.filter((type) => enforcedTypes.has(type));
    return from.length > 0 ? [{ ...rule, from }] : [];
  });
}

const enforcedRules = buildEnforcedRules(elements, [
  ...baseRules,
  ...buildEnforcedSharedRules(elements, sharedRules),
]);

function getFeatureModules(els = elements) {
  return els.map((e) => e.type).filter((type) => type.startsWith("feature/"));
}

// The import aliases of the modules flagged `enforcePublicApi`, for the
// `metabase/enforce-module-public-api` rule.
function getPublicApiModules(els = elements) {
  return els.map((element) => element.publicApiAlias).filter(Boolean);
}

export {
  elements,
  rules,
  enforcedRules,
  getFeatureModules,
  getPublicApiModules,
};

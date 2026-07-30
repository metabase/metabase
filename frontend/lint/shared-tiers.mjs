// Rules for shared modules
//
// The shared tier is split into three SUB-TIERS, each ordered into LEVELS:
//
//   shared-utils    — plumbing & app services; no product concepts
//   shared-platform — building blocks the domains compose
//   shared-domain   — domain-specific modules, no cross-domain dependencies
//
//
// Existing violations are grandfathered in eslint-suppressions.json.
// Fixed ones are pruned with:
// `eslint --prune-suppressions`; after planned module moves
// Re-baseline with:
// `eslint --suppress-rule boundaries/element-types`.

const SHARED_UTILS_LEVELS = [
  // U0 — foundation: leaf plumbing.
  [
    "shared/schema",
    "shared/urls",
    "shared/styled-components",
    "shared/cljs-dev-tools",
  ],
  // U1 — the api client.
  ["shared/api"],
  // U2 — routing facade.
  ["shared/router"],
  // U3 — the store slices and hooks.
  ["shared/redux"],
  // U4 — the plugin registry.
  ["shared/plugins"],
  // U5 — app services over the store and registry.
  [
    "shared/selectors",
    "shared/content-translation",
    "shared/error-boundary",
    "shared/forms",
    "shared/archive",
    "shared/hooks",
  ],
  // U6 — composition over the levels below. The store factory composes
  // reducers, plugin middlewares, and the router, so it sits above them.
  ["shared/hoc", "shared/upsells", "shared/route-guards", "shared/redux-store"],
];

const SHARED_PLATFORM_LEVELS = [
  // P0 — independent peers: chart rendering and database metadata/forms.
  ["shared/visualizations", "shared/databases"],
  // P1 — query editing composes visualizations.
  ["shared/querying"],
  // P2 — building blocks over querying; mutually independent.
  [
    "shared/metadata",
    "shared/parameters",
    "shared/questions",
    "shared/search-ui",
  ],
];

const SHARED_DOMAIN = [
  "shared/actions",
  "shared/comments",
  "shared/custom-viz",
  "shared/data-grid",
  "shared/detail-view",
  "shared/metabot",
  "shared/metrics-ui",
  "shared/nav",
  "shared/notifications",
  "shared/palette",
  "shared/pulse",
  "shared/rich_text_editing",
  "shared/routes-stable-id-aware",
  "shared/static-viz",
  "shared/status",
  "shared/timelines",
  "shared/transforms",
  "shared/visualizer",
];

const SHARED_UTILS = SHARED_UTILS_LEVELS.flat();
const SHARED_PLATFORM = SHARED_PLATFORM_LEVELS.flat();
const TIERED_SHARED = [...SHARED_UTILS, ...SHARED_PLATFORM, ...SHARED_DOMAIN];

// Allow-lists implementing the level ordering: each level may import only
// strictly lower levels of its sub-tier (plus `base` — the sub-tiers below).
// Same-level peers are deliberately not allowed.
const levelAllows = (levels, base = []) =>
  levels.flatMap((level, i) => {
    const below = [...base, ...levels.slice(0, i).flat()];
    return level.length === 0 || below.length === 0
      ? []
      : [{ from: level, allow: below }];
  });

const sharedRules = [
  // These rules assume the baseline shared/* allow in module-boundaries.mjs
  // precedes them (they narrow it; later rules win). Edges to UNTIERED
  // modules (common, monitor, embedding, types) fall through to that
  // baseline.
  // Disallow everything leveled, then re-allow per sub-tier/level.
  {
    from: SHARED_UTILS,
    disallow: TIERED_SHARED,
    message:
      "shared-utils modules may only import shared-utils modules in strictly lower levels (see SHARED_UTILS_LEVELS)",
  },
  ...levelAllows(SHARED_UTILS_LEVELS),
  {
    from: SHARED_PLATFORM,
    disallow: TIERED_SHARED,
    message:
      "shared-platform modules may only import shared-utils, and platform modules in strictly lower levels (see SHARED_PLATFORM_LEVELS)",
  },
  ...levelAllows(SHARED_PLATFORM_LEVELS, SHARED_UTILS),
  {
    from: SHARED_DOMAIN,
    disallow: TIERED_SHARED,
    message:
      "shared-domain modules must not import other shared-domain modules; push the shared piece down or compose at feature tier",
  },
  {
    from: SHARED_DOMAIN,
    allow: [...SHARED_UTILS, ...SHARED_PLATFORM],
  },
  // Self-imports are internal to a module; re-allow them explicitly since
  // the level rules above exclude a module's own level.
  ...TIERED_SHARED.map((type) => ({ from: [type], allow: [type] })),
  // TRANSITIONAL domain clusters — bidirectional today; split to
  // one-directional as the severs land, delete when empty.
  {
    from: ["shared/visualizations"],
    allow: [
      "shared/custom-viz",
      "shared/data-grid",
      "shared/static-viz",
      "shared/visualizer",
    ],
  },
  {
    from: ["shared/metabot", "shared/rich_text_editing", "shared/comments"],
    allow: ["shared/metabot", "shared/rich_text_editing", "shared/comments"],
  },
  {
    from: ["shared/nav", "shared/palette"],
    allow: ["shared/nav", "shared/palette"],
  },
  {
    from: ["shared/notifications", "shared/pulse"],
    allow: ["shared/notifications", "shared/pulse"],
  },
];

export { sharedRules };

// Rules for shared modules
//
// The shared tier is split into three SUB-TIERS, each ordered into LEVELS:
//
//   shared-utils    — plumbing and app services, no product concepts
//   shared-platform — building blocks the domains compose
//   shared-domain   — domain-specific modules, no cross-domain dependencies
//
// Violations are grandfathered per module with enforceSharedTiers: false
// in module-boundaries.mjs.

const SHARED_UTILS_LEVELS = [
  // U0 — foundation: leaf plumbing.
  ["shared/urls", "shared/styled-components", "shared/cljs-dev-tools"],
  // U1 — the api client.
  ["shared/api"],
  // U2 — the store slices and hooks.
  ["shared/redux"],
  // U3 — the plugin registry, and instance settings over the api and store.
  ["shared/plugins", "shared/settings"],
  // U4 — the current user, composed over the plugin registry for application permissions.
  ["shared/current-user"],
  // U5 — app services over the store, registry and current user.
  [
    "shared/metadata-store",
    "shared/selectors",
    "shared/content-translation",
    "shared/error-boundary",
    "shared/forms",
    "shared/archive",
    "shared/hooks",
  ],
  // U6 — composition over the levels below.
  // The store factory composes reducers, plugin middlewares, and the router.
  [
    "shared/hoc",
    "shared/upsells",
    "shared/route-guards",
    "shared/redux-store",
    "shared/search-ui",
    "shared/rich_text_editing",
  ],
];

const SHARED_PLATFORM_LEVELS = [
  // P0 — independent peers: the data grid and writeback actions.
  ["shared/data-grid", "shared/actions"],
  // P1 — independent peers: chart rendering and database metadata/forms.
  ["shared/visualizations", "shared/databases"],
  // P2 — independent peers with no edges between them.
  // Querying and detail-view compose visualizations. Metadata consumes detail-view from P3.
  // detail-view keeps its enforceSharedTiers flag for one upward edge,
  // DetailViewPage.tsx importing the nav layout constants (#79119 moves them).
  ["shared/querying", "shared/pulse", "shared/detail-view"],
  // P3 — building blocks over querying, mutually independent.
  ["shared/metadata", "shared/parameters", "shared/questions"],
  // P4 — the metabot agent, which transforms and nav compose.
  // metabot keeps its enforceSharedTiers flag for its remaining upward edges:
  // Metabot.tsx imports MainNavbar.styled, and querying imports metabot in three places.
  ["shared/metabot"],
];

const SHARED_DOMAIN = [
  "shared/comments",
  "shared/custom-viz",
  "shared/metrics-ui",
  "shared/nav",
  "shared/notifications",
  "shared/palette",
  "shared/segments",
  "shared/static-viz",
  "shared/status",
  "shared/timelines",
  "shared/transforms",
  "shared/visualizer",
];

const SHARED_UTILS = SHARED_UTILS_LEVELS.flat();
const SHARED_PLATFORM = SHARED_PLATFORM_LEVELS.flat();
const TIERED_SHARED = [...SHARED_UTILS, ...SHARED_PLATFORM, ...SHARED_DOMAIN];

// Each level may import only strictly lower levels of its sub-tier,
// plus `base` (the sub-tiers below).
// Same-level peers are deliberately not allowed.
const levelAllows = (levels, base = []) =>
  levels.flatMap((level, i) => {
    const below = [...base, ...levels.slice(0, i).flat()];
    return level.length === 0 || below.length === 0
      ? []
      : [{ from: level, allow: below }];
  });

const sharedRules = [
  // Later rules win, so these must come after the baseline shared/* allow they narrow.
  // Edges to untiered modules (common, embedding, types) fall through to that allow.
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
  // The level rules exclude a module's own level, so re-allow self-imports explicitly.
  ...TIERED_SHARED.map((type) => ({ from: [type], allow: [type] })),
  // Transitional clusters: these domain modules still import each other, so both ways are allowed.
  // Delete each entry once the imports are one-directional.
  {
    from: ["shared/nav", "shared/palette"],
    allow: ["shared/nav", "shared/palette"],
  },
];

export { sharedRules };

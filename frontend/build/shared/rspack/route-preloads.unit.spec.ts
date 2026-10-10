import { setupEnterprisePlugins } from "__support__/enterprise";
import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "__support__/state";
import { reinitialize } from "metabase/plugins";
import { getRoutes } from "metabase/routes";
import MetabaseSettings from "metabase/utils/settings";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import fs from "fs";

import type { RouteChunk, Unnamed } from "./derive-route-preloads";
import { collectRouteChunks } from "./derive-route-preloads";
import { preloadRows } from "./route-preloads-rows";
import { readRoutes } from "./routes";
// The lint rule `bounded-route-gate` holds route gates to this many features.
// Reading the same constant is what keeps the sweep and the rule in step.
import { ROUTE_GATE_STRENGTH } from "./route-gate-strength";
import {
  GENERATED,
  allRouteChunks,
  executedRouteChunks,
  keyOf,
} from "./route-chunks";

const key = ({ pattern, chunks }: { pattern: string; chunks: string[] }) =>
  `${pattern} -> ${[...chunks].sort().join("+")}`;

// A failure has to be reproducible, so the rows come from a fixed seed rather
// than from Math.random.
const SWEEP_SEED = 20261009;

const randomFrom = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let state = Math.imul(seed ^ (seed >>> 15), seed | 1);
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
};

/**
 * Feature configurations covering every combination of `strength` features at
 * both values. Far smaller than every combination: 59 features need thousands
 * of pairs but only tens of rows.
 */
const coveringArray = (features: string[], strength: number) => {
  const random = randomFrom(SWEEP_SEED);
  const combinations: number[][] = [];
  const choose = (start: number, picked: number[]) => {
    if (picked.length === strength) {
      combinations.push([...picked]);
      return;
    }
    for (let i = start; i < features.length; i++) {
      picked.push(i);
      choose(i + 1, picked);
      picked.pop();
    }
  };
  choose(0, []);

  const needed = combinations.length * 2 ** strength;
  const covered = new Set<number>();
  const rows: boolean[][] = [];

  // Bounded by attempts, not by rows: once coverage saturates no row gains
  // anything, and a loop bounded by rows would never end.
  for (let attempt = 0; attempt < 2000 && covered.size < needed; attempt++) {
    const row = features.map(() => random() < 0.5);
    let gained = false;
    combinations.forEach((combination, index) => {
      let bits = 0;
      for (const feature of combination) {
        bits = (bits << 1) | (row[feature] ? 1 : 0);
      }
      const id = index * 2 ** strength + bits;
      if (!covered.has(id)) {
        covered.add(id);
        gained = true;
      }
    });
    if (gained) {
      rows.push(row);
    }
  }

  return rows.map((row) => {
    const config = features.map((feature, index) => [feature, row[index]]);

    // `fromEntries` widens the keys back to `string`, and every key here comes
    // from the shape of the mock itself.
    return Object.fromEntries(config) as Partial<TokenFeatures>;
  });
};

/**
 * One configuration's route tree.
 *
 * `hasPremiumFeature` reads MetabaseSettings, and a plugin writes its route
 * slots once when it initialises, so the features have to be in place before
 * the plugins re-register. `reinitialize` resets the slots so they can.
 */
const treeFor = (features: Partial<TokenFeatures>) => {
  const tokenFeatures = createMockTokenFeatures(features);
  MetabaseSettings.set("token-features", tokenFeatures);
  reinitialize();
  setupEnterprisePlugins();

  // `getRoutes` wants the app's own store type, which the test store satisfies
  // at runtime but not on paper.
  const store = getStore(mainReducers, {
    settings: createMockSettingsState({ "token-features": tokenFeatures }),
  }) as unknown as Parameters<typeof getRoutes>[0];

  return collectRouteChunks(getRoutes(store));
};

/**
 * Every route any instance can reach, united over the sweep. The reader reports
 * a route whether or not the instance it runs on reaches it, so the executed
 * side has to visit the configurations that select one.
 */
const sweep = () => {
  const features = Object.keys(createMockTokenFeatures());
  const routes = new Map<string, RouteChunk>();
  const unnamed = new Map<string, Unnamed>();

  for (const config of [{}, ...coveringArray(features, ROUTE_GATE_STRENGTH)]) {
    const tree = treeFor(config);
    for (const route of tree.routes) {
      routes.set(key(route), route);
    }
    for (const route of tree.unnamed) {
      unnamed.set(route.pattern, route);
    }
  }

  return { routes: [...routes.values()], unnamed: [...unnamed.values()] };
};

const executed = sweep();
const derived = readRoutes(process.cwd());


/**
 * A note names the construct the reader could not follow, not where it sits, so
 * the arguments of a call and the file it lives in are dropped. A new route that
 * uses an idiom already pinned below is skipped on purpose.
 */
const idiomOf = ({ why, what }: { why: string; what: string }) => {
  const collapsed = what.replace(/\s+/g, " ").trim();
  const call = collapsed.match(/^([\w.]+)\s*\(/);
  return `${why}: ${call ? `${call[1]}(...)` : collapsed}`;
};

/**
 * The constructs the reader cannot follow. Modal routes load no page of their
 * own. The rest are routes a plugin supplies at runtime, which source cannot
 * reach, so those subtrees get no hint.
 */
const UNRESOLVED_IDIOMS = [
  "lazy from a plugin slot: PLUGIN_AUTH_PROVIDERS.settingsJWTForm",
  "lazy from a plugin slot: PLUGIN_AUTH_PROVIDERS.settingsOIDCForm",
  "lazy from a plugin slot: PLUGIN_AUTH_PROVIDERS.settingsSAMLForm",
  "lazy from a plugin slot: PLUGIN_MULTI_FACTOR_AUTH.enrolledUsersPage",
  "lazy from a plugin slot: PLUGIN_MULTI_FACTOR_AUTH.unenrolledUsersPage",
  "lazy from a plugin slot: PLUGIN_SECURITY_CENTER.securityCenterPage",
  "lazy from a plugin slot: PLUGIN_TENANTS.canAccessTenantSpecificRoute",
  "lazy from a plugin slot: PLUGIN_TENANTS.tenantCollectionList",
  "lazy from a plugin slot: PLUGIN_TENANTS.tenantUsersList",
  "lazy from a plugin slot: PLUGIN_TENANTS.tenantUsersPersonalCollectionList",
  "lazy from a plugin slot: PLUGIN_TRANSFORMS_PYTHON.pythonRunnerSettingsPage",
  "lazy not understood: lazyModalComponent(...)",
  "plugin call: PLUGIN_ADMIN_PERMISSIONS_TABS.getRoutes",
  "plugin call: PLUGIN_ADMIN_USER_MENU_ROUTES.map",
  "plugin call: PLUGIN_AI_CONTROLS.getAiControlsRoutes",
  "plugin call: PLUGIN_APPLICATION_PERMISSIONS.getRoutes",
  "plugin call: PLUGIN_AUDIT.getAiAuditingRoutes",
  "plugin call: PLUGIN_DATA_APPS.getRoutes",
  "plugin call: PLUGIN_DB_ROUTING.getDestinationDatabaseRoutes",
  "plugin call: PLUGIN_DEPENDENCIES.getDataStudioDependencyRoutes",
  "plugin call: PLUGIN_LIBRARY.getDataStudioLibraryRoutes",
  "plugin call: PLUGIN_MONITOR.getDependencyDiagnosticsRoutes",
  "plugin call: PLUGIN_MONITOR.getSessionManagementRoutes",
  "plugin call: PLUGIN_REPLACEMENT.getTransformToolsRoutes",
  "plugin call: PLUGIN_SCHEMA_VIEWER.getDataStudioSchemaViewerRoutes",
  "plugin call: PLUGIN_TABLE_EDITING.getRoutes",
  "plugin call: PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes",
  "plugin call: PLUGIN_TRANSFORMS_PYTHON.getPythonTransformsRoutes",
  "plugin call: PLUGIN_WRITABLE_CONNECTION.getWritableConnectionInfoRoutes",
  "unknown call: getDefaults",
];

describe("the route preload manifest", () => {
  /**
   * The manifest carries what source reports plus what only building the tree
   * finds, so this file is half of it rather than a check on the other half. It
   * is committed because a production build has no module environment to run
   * the tree in, and it holds chunk names and no hashes, so it is stable.
   *
   * Regenerate with `UPDATE_ROUTE_CHUNKS=1`.
   */
  it("keeps the generated route chunks current", () => {
    const found = [...new Map(executed.routes.map((r) => [keyOf(r), r])).values()]
      .map(({ pattern, chunks }) => ({ pattern, chunks: [...chunks].sort() }))
      .sort((a, b) => keyOf(a).localeCompare(keyOf(b)));

    if (process.env.UPDATE_ROUTE_CHUNKS) {
      fs.writeFileSync(GENERATED, `${JSON.stringify(found, null, 2)}\n`);
    }

    expect(executedRouteChunks()).toEqual(found);
  });

  /**
   * Reading source reports every route, not only the ones that load a chunk, so
   * a caller can ask what parameters a URL takes. A route type generator would
   * read exactly this.
   */
  it("reads the parameters a URL takes", () => {
    const withParams = derived.routes.filter(
      (route: { params: string[] }) => route.params.length > 0,
    );

    expect(withParams.length).toBeGreaterThan(50);
  });

  it("leaves no page in a chunk nothing can name", () => {
    expect(executed.unnamed.map((route) => route.pattern)).toEqual([]);
  });

  /**
   * A route the reader drops is invisible, and the only sign of one is the note
   * it leaves. Pinning the set turns a new unreadable idiom into a failure here
   * rather than a page that loads slowly in production.
   */
  it("follows every route idiom but the ones pinned here", () => {
    const idioms = [...new Set(derived.notes.map(idiomOf))].sort();

    expect(idioms).toEqual(UNRESOLVED_IDIOMS);
  });
});

type Row = { patterns: string[]; chunks: string[] };
type Route = { pattern: string; chunks: string[] };

/**
 * The subset of clout the generator emits: `:name` takes one segment, `*` takes
 * the rest. The backend uses clout itself; this mirrors it well enough to check
 * which row a URL lands on.
 */
function matches(pattern: string, path: string) {
  const source = pattern
    .split("/")
    .map((segment) => {
      if (segment === "*") {
        return "(?:.*)";
      }
      if (segment.startsWith(":")) {
        return "[^/]+";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  return new RegExp(`^${source}$`).test(path);
}

const urlFor = (pattern: string) =>
  pattern
    .split("/")
    .map((segment) =>
      segment.startsWith(":") ? "1" : segment === "*" ? "x" : segment,
    )
    .join("/") || "/";

/**
 * The backend takes the first row that matches and writes only that one, so
 * every row has to carry its ancestors' chunks as well as its own. Rows are
 * sorted deepest first, which is what makes the most specific row win.
 *
 * Concatenating every matching row instead would be worse: `/question/ask` also
 * matches `/question/*`, so it would pull the query builder that page never
 * renders.
 */
describe("the first row a URL matches", () => {
  const manifest = allRouteChunks(process.cwd());
  const rows: Row[] = preloadRows(manifest);

  // Routes sharing a URL render together, so the URL needs their chunks united.
  const needed = new Map<string, Set<string>>();
  // `readRoutes` is plain JavaScript, so its rows arrive untyped here.
  for (const route of manifest as Route[]) {
    if (route.chunks.length === 0) {
      continue;
    }
    const url = urlFor(route.pattern);
    needed.set(url, new Set([...(needed.get(url) ?? []), ...route.chunks]));
  }

  const compare = (want: Set<string>, url: string) => {
    const hit = rows.find((row) => row.patterns.some((p) => matches(p, url)));
    const got = new Set(hit ? hit.chunks : []);
    return {
      missing: [...want].filter((chunk) => !got.has(chunk)),
      extra: [...got].filter((chunk) => !want.has(chunk)),
    };
  };

  const report = (pick: "missing" | "extra") =>
    [...needed]
      .map(([url, want]) => [url, compare(want, url)[pick]] as const)
      .filter(([, chunks]) => chunks.length > 0)
      .map(([url, chunks]) => `${url} ${chunks.join("+")}`);

  it("carries every chunk the URL needs", () => {
    expect(report("missing")).toEqual([]);
  });

  /**
   * One extra, and it is the cheaper side of a trade. `/monitor/sessions/*` is a
   * catch-all beside `/monitor/sessions/:sessionId`, and both share the row that
   * names the segment, so a URL landing on the catch-all also fetches the
   * session page's chunk. A row nobody matches costs one download. A missing row
   * costs a page.
   */
  it("hints nothing the URL does not use, bar one catch-all", () => {
    expect(report("extra")).toEqual([
      "/monitor/sessions/x monitor-session-management",
    ]);
  });
});

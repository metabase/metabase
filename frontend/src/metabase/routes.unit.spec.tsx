import { setupEnterprisePlugins } from "__support__/enterprise";
import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "__support__/state";
import { reinitialize } from "metabase/plugins";
import type { RouteObject } from "metabase/router";
import { getRoutes } from "metabase/routes";
import MetabaseSettings from "metabase/utils/settings";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

/**
 * The route tree must not depend on configuration: every route mounts on every
 * instance, and what a route renders is decided when it is navigated to. The
 * preload manifest, the router and the tests can then all treat one tree as
 * the truth.
 *
 * Two ratchets hold the invariant. Both lists may only shrink; when they are
 * empty, violations become hard failures.
 */

/** Configuration reads while the tree is being built. Shrink to []. */
const CONFIG_READS_DURING_BUILD: string[] = ["store.getState()"];

/**
 * How many routes mount conditionally today. Two integers rather than a route
 * inventory: the routes are not the debt, the conditional mounting sites are,
 * so a list here would churn on every rename inside a gated subtree. The
 * numbers may only go down; lower them as sites migrate. A failure names
 * counts, not routes, so on growth diff the two pattern sets locally.
 */
const CONDITIONAL_MOUNTS_BUDGET = {
  onlyWithFeatures: 146,
  onlyWithoutFeatures: 4,
};

const featuresWith = (enabled: boolean): TokenFeatures => {
  const pairs = Object.keys(createMockTokenFeatures()).map((feature) => [
    feature,
    enabled,
  ]);

  // `fromEntries` widens the keys back to `string`, and every key here comes
  // from the shape of the mock itself.
  return Object.fromEntries(pairs) as TokenFeatures;
};

const storeFor = (tokenFeatures: TokenFeatures) => {
  const store = getStore(mainReducers, {
    settings: createMockSettingsState({ "token-features": tokenFeatures }),
  });

  // The test store satisfies `getRoutes` at runtime but not on paper.
  return store as unknown as Parameters<typeof getRoutes>[0];
};

const treeFor = (tokenFeatures: TokenFeatures) => {
  // Plugins write their slots once, at init, reading MetabaseSettings, so the
  // features have to be in place before they re-register.
  MetabaseSettings.set("token-features", tokenFeatures);
  reinitialize();
  setupEnterprisePlugins();

  return getRoutes(storeFor(tokenFeatures));
};

const patternsOf = (
  routes: RouteObject[],
  prefix = "",
  found = new Set<string>(),
) => {
  for (const route of routes) {
    const path = route.path ?? "";
    const here = path.startsWith("/")
      ? path
      : `${prefix}/${path}`.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    found.add(here);
    patternsOf(route.children ?? [], here === "/" ? "" : here, found);
  }
  return found;
};

describe("the route tree is the same on every instance", () => {
  it("reads no configuration while it is built", () => {
    const tokenFeatures = featuresWith(false);
    MetabaseSettings.set("token-features", tokenFeatures);
    reinitialize();
    setupEnterprisePlugins();

    const store = storeFor(tokenFeatures);
    const reads: string[] = [];

    const settingsSpy = jest
      .spyOn(MetabaseSettings, "get")
      .mockImplementation((key) => {
        reads.push(`MetabaseSettings.get("${String(key)}")`);
        return undefined;
      });
    const stateSpy = jest.spyOn(store, "getState");

    try {
      getRoutes(store);
    } finally {
      settingsSpy.mockRestore();
    }
    if (stateSpy.mock.calls.length > 0) {
      reads.push("store.getState()");
    }
    stateSpy.mockRestore();

    expect([...new Set(reads)].sort()).toEqual(CONFIG_READS_DURING_BUILD);
  });

  it("mounts the same routes with and without token features", () => {
    const withoutFeatures = patternsOf(treeFor(featuresWith(false)));
    const withFeatures = patternsOf(treeFor(featuresWith(true)));

    const onlyWithFeatures = [...withFeatures].filter(
      (route) => !withoutFeatures.has(route),
    );
    const onlyWithoutFeatures = [...withoutFeatures].filter(
      (route) => !withFeatures.has(route),
    );

    expect(onlyWithFeatures.length).toBeLessThanOrEqual(
      CONDITIONAL_MOUNTS_BUDGET.onlyWithFeatures,
    );
    expect(onlyWithoutFeatures.length).toBeLessThanOrEqual(
      CONDITIONAL_MOUNTS_BUDGET.onlyWithoutFeatures,
    );
  });
});

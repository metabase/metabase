import { setupEnterprisePlugins } from "__support__/enterprise";
import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "__support__/state";
import * as plugins from "metabase/plugins";
import { PLUGIN_IS_EE_BUILD, reinitialize } from "metabase/plugins";
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
 * To make a route's page depend on a feature, gate it at render time instead of
 * mounting it conditionally: `featureGatedRoute` for a lazy route,
 * `featureGatedComponent` for an eager element, or a guard component that
 * renders an `Outlet` or `NotFound` for a runtime setting.
 */

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

/**
 * `reinitialize` resets the slot to its OSS default, and the assignment that
 * marks an EE build runs at module scope, so requiring the already-cached
 * module does not put it back. Without this, the routes an EE build alone
 * mounts stay absent from both trees and compare equal.
 */
const setupPlugins = () => {
  reinitialize();
  PLUGIN_IS_EE_BUILD.isEEBuild = () => true;
  setupEnterprisePlugins();
};

const treeFor = (tokenFeatures: TokenFeatures) => {
  // Plugins write their slots once, at init, reading MetabaseSettings, so the
  // features have to be in place before they re-register.
  MetabaseSettings.set("token-features", tokenFeatures);
  setupPlugins();

  return getRoutes(storeFor(tokenFeatures));
};

type RouteShape = {
  path: string | null;
  index: boolean;
  hasElement: boolean;
  hasLazy: boolean;
  children: RouteShape[];
};

/**
 * Path patterns alone miss a conditional child that carries no path of its own,
 * such as an index route, and a layout swapped for a leaf. The node's own kind
 * and its children's order are part of the shape.
 */
const shapeOf = (routes: RouteObject[]): RouteShape[] =>
  routes.map((route) => ({
    path: route.path ?? null,
    index: route.index ?? false,
    hasElement: Boolean(route.element),
    hasLazy: Boolean(route.lazy),
    children: shapeOf(route.children ?? []),
  }));

/**
 * A plugin's `isEnabled` is a token feature under another name, so reading one
 * while the tree is built is reading configuration.
 */
const spyOnPluginFlags = (reads: string[]) => {
  const undos: (() => void)[] = [];

  for (const [name, slot] of Object.entries(plugins)) {
    if (
      !name.startsWith("PLUGIN_") ||
      typeof slot !== "object" ||
      slot === null ||
      !Object.hasOwn(slot, "isEnabled")
    ) {
      continue;
    }

    // The slot shapes differ, and the loop has just established that this one
    // carries `isEnabled`.
    const value = (slot as { isEnabled: unknown }).isEnabled;

    Object.defineProperty(slot, "isEnabled", {
      configurable: true,
      enumerable: true,
      get: () => {
        reads.push(`${name}.isEnabled`);
        return value;
      },
    });

    undos.push(() =>
      Object.defineProperty(slot, "isEnabled", {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      }),
    );
  }

  return () => undos.forEach((undo) => undo());
};

describe("the route tree is the same on every instance", () => {
  it("reads no configuration while it is built", () => {
    const tokenFeatures = featuresWith(false);
    MetabaseSettings.set("token-features", tokenFeatures);
    setupPlugins();

    const store = storeFor(tokenFeatures);
    const reads: string[] = [];

    const settingsSpy = jest
      .spyOn(MetabaseSettings, "get")
      .mockImplementation((key) => {
        reads.push(`MetabaseSettings.get("${String(key)}")`);
        return undefined;
      });
    const stateSpy = jest.spyOn(store, "getState");
    const restoreFlags = spyOnPluginFlags(reads);

    try {
      getRoutes(store);
    } finally {
      restoreFlags();
      settingsSpy.mockRestore();
    }
    if (stateSpy.mock.calls.length > 0) {
      reads.push("store.getState()");
    }
    stateSpy.mockRestore();

    expect([...new Set(reads)].sort()).toEqual([]);
  });

  it("mounts the same routes with and without token features", () => {
    expect(shapeOf(treeFor(featuresWith(true)))).toEqual(
      shapeOf(treeFor(featuresWith(false))),
    );
  });
});

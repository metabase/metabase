import type { ReactNode } from "react";

import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "__support__/state";
import { type RouteObject, toRouteObjects } from "metabase/router";

import { getRoutes } from "./routes";
import { getSettingsRoutes } from "./settingsRoutes";

/**
 * These routes name their page in an `import()` rather than importing it, so
 * nothing type-checks the path or the export any more, and nothing renders the
 * admin tree in a test. A typo would first show up as a blank admin page.
 * Resolving every loader is the cheap guard against that.
 */
function lazyLoaders(tree: ReactNode) {
  const loaders: (() => Promise<{ Component?: unknown }>)[] = [];

  const collect = (routes: RouteObject[]) => {
    for (const route of routes) {
      if (typeof route.lazy === "function") {
        loaders.push(route.lazy);
      }
      collect(route.children ?? []);
    }
  };

  collect(toRouteObjects(tree));
  return loaders;
}

const Guard = () => null;

// A real store: `getRoutes` reads a setting off it to decide whether the custom
// visualisation development route exists at all.
function createStore() {
  return getStore(mainReducers, {
    settings: createMockSettingsState({
      "custom-viz-plugin-dev-mode-enabled": true,
    }),
  });
}

describe("admin routes", () => {
  it("resolves every page in the admin tree", async () => {
    const loaders = lazyLoaders(getRoutes(createStore(), Guard, Guard));

    expect(loaders.length).toBeGreaterThan(30);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });

  it("resolves every page in the settings tree", async () => {
    const loaders = lazyLoaders(getSettingsRoutes(createStore(), Guard));

    expect(loaders.length).toBeGreaterThan(20);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});

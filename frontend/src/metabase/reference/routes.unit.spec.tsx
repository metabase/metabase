import type { RouteObject } from "metabase/router";

import { getReferenceRoutes } from "./routes";

/**
 * These routes name their page in an `import()` rather than importing it, so
 * nothing type-checks the path or the export any more, and the container specs
 * render their components directly rather than through a route. A typo would
 * first show up as a blank page under `/reference`. Resolving every loader is
 * the cheap guard against that.
 */
function lazyLoaders(routes: RouteObject[]) {
  const loaders: (() => Promise<{ Component?: unknown }>)[] = [];

  const collect = (nested: RouteObject[]) => {
    for (const route of nested) {
      if (typeof route.lazy === "function") {
        loaders.push(route.lazy);
      }
      collect(route.children ?? []);
    }
  };

  collect(routes);
  return loaders;
}

describe("reference routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getReferenceRoutes());

    expect(loaders).toHaveLength(14);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });

  it("keeps the section root redirecting to databases", () => {
    const [reference] = getReferenceRoutes();
    const index = reference.children?.find((route) => route.index);

    expect(reference.path).toBe("/reference");
    expect(index?.element).toBeDefined();
  });
});

import type { ReactNode } from "react";

import { type RouteObject, toRouteObjects } from "metabase/router";

type LazyLoader = () => Promise<{ Component?: unknown }>;

/**
 * Every `route.lazy` loader in a route tree.
 *
 * A route factory names its page in an `import()` rather than importing it, so
 * nothing type-checks the path or the export any more. Resolving each loader in
 * a test is the cheap guard against a typo that would otherwise first appear as
 * a blank page.
 */
export function lazyLoaders(tree: ReactNode): LazyLoader[] {
  const loaders: LazyLoader[] = [];

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

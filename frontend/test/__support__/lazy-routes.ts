import type { ReactNode } from "react";

import { type RouteObject, toRouteObjects } from "metabase/router";

type LazyLoader = () => Promise<{ Component?: unknown }>;

type GatedLoader = LazyLoader & {
  enabled: LazyLoader;
  disabled: LazyLoader;
};

// Structural rather than `isFeatureGatedRoute`, so OSS test support does not
// import the enterprise module that builds the gates.
const isGatedLoader = (loader: LazyLoader): loader is GatedLoader =>
  "gatedOn" in loader;

/**
 * Every `route.lazy` loader in a route tree.
 *
 * A route factory names its page in an `import()` rather than importing it, so
 * nothing type-checks the path or the export any more. Resolving each loader in
 * a test is the cheap guard against a typo that would otherwise first appear as
 * a blank page.
 *
 * A gated loader expands to both of its pages, so the test environment's
 * feature state cannot hide a typo in the page it would not pick.
 */
export function lazyLoaders(tree: ReactNode): LazyLoader[] {
  const loaders: LazyLoader[] = [];

  const collect = (routes: RouteObject[]) => {
    for (const route of routes) {
      if (typeof route.lazy === "function") {
        if (isGatedLoader(route.lazy)) {
          loaders.push(route.lazy.enabled, route.lazy.disabled);
        } else {
          loaders.push(route.lazy);
        }
      }
      collect(route.children ?? []);
    }
  };

  collect(toRouteObjects(tree));
  return loaders;
}

import { type RouteObject, toRouteObjects } from "metabase/router";

import { getEmbeddingHubRoutes } from "./routes";

/**
 * Every page here is imported directly, so TypeScript already catches a bad
 * component reference. What it cannot catch is a path string, and no e2e test
 * visits `sso-setup`. Reading the tree as data keeps those honest without
 * rendering the pages, the layout or the guard.
 */
describe("embedding hub routes", () => {
  it("routes every page it owns", () => {
    const paths = leafPaths(toRouteObjects(getEmbeddingHubRoutes()));

    expect(paths).toEqual([
      "embedding",
      "embedding/get-started",
      "embedding/get-started/permissions-setup",
      "embedding/get-started/sso-setup",
    ]);
  });
});

function leafPaths(routes: RouteObject[], prefix = ""): string[] {
  return routes.flatMap((route) => {
    const path = [prefix, route.path].filter(Boolean).join("/");
    const children = route.children ?? [];

    return children.length > 0 ? leafPaths(children, path) : [path];
  });
}

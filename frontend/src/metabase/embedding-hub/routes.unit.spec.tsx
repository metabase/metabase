import type { ReactNode } from "react";

import { type RouteObject, toRouteObjects } from "metabase/router";
import * as Urls from "metabase/urls";

import { getEmbeddingHubRoutes } from "./routes";

/**
 * Every page here is imported directly, so TypeScript already catches a bad
 * component reference. What it cannot catch is a path string, and no e2e test
 * visits `sso-setup`. Reading the tree as data keeps those honest without
 * rendering the pages, the layout or the guard.
 */
describe("embedding hub routes", () => {
  it("routes every page it owns", () => {
    const paths = leafRoutes().map((route) => route.path);

    expect(paths).toEqual([
      "embedding",
      "embedding/get-started",
      "embedding/get-started/permissions-setup",
      "embedding/get-started/sso-setup",
    ]);
  });

  it("redirects the hub root to Get started", () => {
    const root = leafRoutes().find((route) => route.path === "embedding");

    expect(root?.index).toBe(true);
    expect(navigateTarget(root?.element)).toBe(Urls.embeddingHubGetStarted());
  });
});

type LeafRoute = { path: string; index: boolean; element: ReactNode };

function leafRoutes(): LeafRoute[] {
  return collectLeaves(toRouteObjects(getEmbeddingHubRoutes()));
}

function collectLeaves(routes: RouteObject[], prefix = ""): LeafRoute[] {
  return routes.flatMap((route) => {
    const path = [prefix, route.path].filter(Boolean).join("/");
    const children = route.children ?? [];

    if (children.length > 0) {
      return collectLeaves(children, path);
    }

    return [{ path, index: Boolean(route.index), element: route.element }];
  });
}

function navigateTarget(element: ReactNode) {
  // ReactNode is a union wide enough that `props` is not on it, and the element
  // type here is whatever `<Navigate>` renders as, which the router does not export.
  return (element as { props?: { to?: string } })?.props?.to;
}

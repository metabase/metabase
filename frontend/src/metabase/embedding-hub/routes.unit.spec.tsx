import { lazyLoaders } from "__support__/lazy-routes";
import { SdkIframeEmbedSetupPage } from "metabase/embedding/embedding-iframe-sdk-setup/components/SdkIframeEmbedSetupPage";
import { type RouteObject, matchRoutes, toRouteObjects } from "metabase/router";

import { getEmbeddingHubRoutes } from "./routes";

/**
 * Reading the tree as data keeps the paths honest without rendering the pages,
 * the layout or the guard. No e2e test visits `sso`.
 *
 * Each page is named in an `import()` rather than imported, so resolving every
 * loader is what catches a typo that would otherwise first show as a blank page.
 */
describe("embedding hub routes", () => {
  it("routes every page it owns", () => {
    const paths = leafPaths(toRouteObjects(getEmbeddingHubRoutes()));

    expect(paths).toEqual([
      "embedding",
      "embedding/get-started",
      "embedding/get-started/new-embed",
      "embedding/get-started/permissions",
      "embedding/get-started/sso",
      "embedding/security",
      "embedding/security/new-embed",
      "embedding/authentication",
      "embedding/authentication/new-embed",
      "embedding/permissions",
      // Contributed by getAdminPermissionsRoutes(), not declared here.
      "embedding/permissions/data",
      "embedding/permissions/data/database",
      "embedding/permissions/data/database/:databaseId",
      "embedding/permissions/data/database/:databaseId/table/:tableId",
      "embedding/permissions/data/database/:databaseId/schema/:schemaName",
      "embedding/permissions/data/database/:databaseId/schema/:schemaName/table/:tableId",
      "embedding/permissions/data/group",
      "embedding/permissions/data/group/:groupId",
      "embedding/permissions/data/group/:groupId/database/:databaseId",
      "embedding/permissions/data/group/:groupId/database/:databaseId/schema/:schemaName",
      "embedding/permissions/collections",
      "embedding/permissions/collections/:collectionId",
      "embedding/permissions/new-embed",
      "embedding/tenancy",
      "embedding/tenancy/new-embed",
      "embedding/appearance",
      "embedding/appearance/new-embed",
      "embedding/appearance/theme",
      "embedding/appearance/theme/:themeId",
      "embedding/localization",
      "embedding/localization/new-embed",
    ]);
  });

  // The wizard is reachable from every tab's nav, so a tab without its own
  // wizard path would navigate nowhere. Adding a tab fails here until its
  // `new-embed` route is added too, pointing at the wizard itself.
  it("gives every tab a wizard route that loads the wizard", async () => {
    const routes = toRouteObjects(getEmbeddingHubRoutes());
    const tabs = tabSegments(leafPaths(routes));

    expect(tabs).not.toHaveLength(0);

    for (const tab of tabs) {
      const route = matchRoutes(routes, `/embedding/${tab}/new-embed`)?.at(-1)
        ?.route;

      expect(route?.lazy).toBeInstanceOf(Function);
      expect((await route?.lazy?.())?.Component).toBe(SdkIframeEmbedSetupPage);
    }
  });

  // An unknown tab has no route of its own, so it falls through to the app's
  // not-found rather than rendering the wizard over a blank hub.
  it("does not match the wizard under an unknown tab", () => {
    const matches = matchRoutes(
      toRouteObjects(getEmbeddingHubRoutes()),
      "/embedding/not-a-tab/new-embed",
    );

    expect(matches).toBeNull();
  });

  it("resolves every page", async () => {
    const loaders = lazyLoaders(getEmbeddingHubRoutes());

    // Includes the appearance/theme route and one wizard route per tab.
    expect(loaders).toHaveLength(29);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});

/** The path segment each hub tab owns, e.g. `security` from `embedding/security`. */
function tabSegments(paths: string[]) {
  const segments = paths
    .map((path) => path.split("/")[1])
    .filter((segment) => segment != null && segment !== "new-embed");

  return [...new Set(segments)];
}

function leafPaths(routes: RouteObject[], prefix = ""): string[] {
  return routes.flatMap((route) => {
    const path = [prefix, route.path].filter(Boolean).join("/");
    const children = route.children ?? [];

    if (children.length === 0) {
      return [path];
    }

    // A route can render a page and host children at once, so it owns a path of
    // its own -- unless a child without a path already reports the same one.
    const ownsPath =
      route.lazy != null && !children.some((child) => child.path == null);

    return [...(ownsPath ? [path] : []), ...leafPaths(children, path)];
  });
}

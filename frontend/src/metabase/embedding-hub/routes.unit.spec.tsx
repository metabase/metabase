import { lazyLoaders } from "__support__/lazy-routes";
import { type RouteObject, toRouteObjects } from "metabase/router";

import { getEmbeddingHubRoutes } from "./routes";

/**
 * Reading the tree as data keeps the paths honest without rendering the pages,
 * the layout or the guard. No e2e test visits `sso-setup`.
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
      "embedding/get-started/permissions-setup",
      "embedding/get-started/sso-setup",
      "embedding/security",
      "embedding/authentication",
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
      "embedding/permissions/collections/:collectionId",
      "embedding/tenancy",
      "embedding/appearance",
      "embedding/appearance/theme",
      "embedding/appearance/theme/:themeId",
      "embedding/localization",
    ]);
  });

  it("resolves every page", async () => {
    const loaders = lazyLoaders(getEmbeddingHubRoutes());

    // 22: includes the appearance/theme route, which is lazy too.
    expect(loaders).toHaveLength(22);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});

function leafPaths(routes: RouteObject[], prefix = ""): string[] {
  return routes.flatMap((route) => {
    const path = [prefix, route.path].filter(Boolean).join("/");
    const children = route.children ?? [];

    return children.length > 0 ? leafPaths(children, path) : [path];
  });
}

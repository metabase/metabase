import type { ReactNode } from "react";

import { type RouteObject, toRouteObjects } from "metabase/router";
import {
  getAiControlsRoutes,
  getMcpToolsAccessRoutes,
} from "metabase-enterprise/ai-controls/routes";
import { getApplicationPermissionsRoutes } from "metabase-enterprise/application_permissions/routes";
import { getRoutes as getDataAppRoutes } from "metabase-enterprise/data_apps/routes";
import { getDataStudioDependencyRoutes } from "metabase-enterprise/dependencies/routes";
import { getTransformToolsRoutes } from "metabase-enterprise/replacement/routes";
import { getDataStudioSchemaViewerRoutes } from "metabase-enterprise/schema_viewer/routes";
import { isFeatureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";
import { getRoutes as getTableEditingRoutes } from "metabase-enterprise/table-editing/routes";
import { getInspectorRoutes } from "metabase-enterprise/transforms-inspector/routes";
import { getPythonTransformsRoutes } from "metabase-enterprise/transforms-python/routes";

/**
 * A plugin route factory names its page in an `import()` rather than importing
 * it, so nothing type-checks the path or the export any more. Nothing renders
 * these route trees in a test either, so a typo would first show up as a blank
 * admin page. Resolving every loader is the cheap guard against that.
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

const FACTORIES: [string, ReactNode, number][] = [
  ["ai-controls", getAiControlsRoutes(), 6],
  ["mcp tools access", getMcpToolsAccessRoutes(), 1],
  ["schema viewer", getDataStudioSchemaViewerRoutes(), 1],
  ["transforms inspector", getInspectorRoutes(), 2],
  ["application permissions", getApplicationPermissionsRoutes(), 1],
  ["table editing", getTableEditingRoutes(), 1],
  ["python transforms", getPythonTransformsRoutes(), 3],
  ["model replacement", getTransformToolsRoutes(), 1],
  ["data studio dependencies", getDataStudioDependencyRoutes(), 1],
  ["data apps", getDataAppRoutes(), 3],
];

describe("lazy plugin routes", () => {
  it.each(FACTORIES)(
    "resolves every page in %s",
    async (_name, tree, count) => {
      const loaders = lazyLoaders(tree);
      expect(loaders).toHaveLength(count);

      for (const load of loaders) {
        // A gated loader resolves one page per feature state; check both.
        const branches = isFeatureGatedRoute(load)
          ? [load.enabled, load.disabled]
          : [load];
        for (const branch of branches) {
          expect((await branch()).Component).toBeDefined();
        }
      }
    },
  );
});

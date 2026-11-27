import type { ReactNode } from "react";

import { lazyLoaders } from "__support__/lazy-routes";
import {
  getAiControlsRoutes,
  getMcpToolsAccessRoutes,
} from "metabase-enterprise/ai-controls/routes";
import { getApplicationPermissionsRoutes } from "metabase-enterprise/application_permissions/routes";
import { getRoutes as getDataAppRoutes } from "metabase-enterprise/data-apps/host/routes";
import { getTransformTestRoutes } from "metabase-enterprise/data-testing/routes";
import { getDataStudioDependencyRoutes } from "metabase-enterprise/dependencies/routes";
import { getTransformToolsRoutes } from "metabase-enterprise/replacement/routes";
import { getDataStudioSchemaViewerRoutes } from "metabase-enterprise/schema_viewer/routes";
import { getRoutes as getTableEditingRoutes } from "metabase-enterprise/table-editing/routes";
import { getInspectorRoutes } from "metabase-enterprise/transforms-inspector/routes";
import { getPythonTransformsRoutes } from "metabase-enterprise/transforms-python/routes";

/**
 * A plugin route factory names its page in an `import()` rather than importing
 * it, so nothing type-checks the path or the export any more. Nothing renders
 * these route trees in a test either, so a typo would first show up as a blank
 * admin page. Resolving every loader, with both pages of a gated one, is the
 * cheap guard against that.
 */
const FACTORIES: [string, ReactNode, number][] = [
  ["ai-controls", getAiControlsRoutes(), 12],
  ["mcp tools access", getMcpToolsAccessRoutes(), 2],
  ["schema viewer", getDataStudioSchemaViewerRoutes(), 2],
  ["transforms inspector", getInspectorRoutes(), 4],
  ["application permissions", getApplicationPermissionsRoutes(), 2],
  ["table editing", getTableEditingRoutes(), 2],
  ["python transforms", getPythonTransformsRoutes(), 6],
  ["model replacement", getTransformToolsRoutes(), 2],
  ["data studio dependencies", getDataStudioDependencyRoutes(), 3],
  ["data apps", getDataAppRoutes(), 4],
  ["transform tests", getTransformTestRoutes(), 6],
];

describe("lazy plugin routes", () => {
  it.each(FACTORIES)(
    "resolves every page in %s",
    async (_name, tree, count) => {
      const loaders = lazyLoaders(tree);
      expect(loaders).toHaveLength(count);

      for (const load of loaders) {
        expect((await load()).Component).toBeDefined();
      }
    },
  );
});

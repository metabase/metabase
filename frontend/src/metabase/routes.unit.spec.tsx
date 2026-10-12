import { setupEnterprisePlugins } from "__support__/enterprise";
import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "__support__/state";
import { reinitialize } from "metabase/plugins";
import type { RouteObject } from "metabase/router";
import { getRoutes } from "metabase/routes";
import MetabaseSettings from "metabase/utils/settings";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

/**
 * The route tree must not depend on configuration: every route mounts on every
 * instance, and what a route renders is decided when it is navigated to. The
 * preload manifest, the router and the tests can then all treat one tree as
 * the truth.
 *
 * Two ratchets hold the invariant. Both lists may only shrink; when they are
 * empty, violations become hard failures.
 */

/** Configuration reads while the tree is being built. Shrink to []. */
const CONFIG_READS_DURING_BUILD: string[] = ["store.getState()"];

/** Routes that exist only under some token features. Shrink to {[], []}. */
const ROUTES_MOUNTED_CONDITIONALLY = {
  onlyWithFeatures: [
    "/admin/databases/:databaseId/destination-databases",
    "/admin/databases/:databaseId/destination-databases/:destinationDatabaseId",
    "/admin/databases/:databaseId/destination-databases/:destinationDatabaseId/remove",
    "/admin/databases/:databaseId/destination-databases/create",
    "/admin/databases/:databaseId/write-data",
    "/admin/metabot/system-prompts/natural-language-queries",
    "/admin/metabot/system-prompts/sql-generation",
    "/admin/metabot/usage-controls/ai-usage-limits",
    "/admin/metabot/usage-controls/mcp-tools-access",
    "/admin/people/:userId/unsubscribe",
    "/admin/people/tenants/:tenantId",
    "/admin/people/tenants/:tenantId/deactivate",
    "/admin/people/tenants/:tenantId/edit",
    "/admin/people/tenants/:tenantId/reactivate",
    "/admin/people/tenants/groups/:groupId",
    "/admin/people/tenants/new",
    "/admin/people/tenants/people/:userId",
    "/admin/people/tenants/people/:userId/deactivate",
    "/admin/people/tenants/people/:userId/edit",
    "/admin/people/tenants/people/:userId/reactivate",
    "/admin/people/tenants/people/:userId/reset",
    "/admin/people/tenants/people/:userId/success",
    "/admin/people/tenants/people/:userId/unsubscribe",
    "/admin/people/tenants/people/new",
    "/admin/people/tenants/user-strategy",
    "/admin/people/user-strategy",
    "/admin/permissions/application",
    "/admin/permissions/data/database/:databaseId/impersonated/group/:groupId",
    "/admin/permissions/data/database/:databaseId/schema/:schemaName/impersonated/group/:groupId",
    "/admin/permissions/data/database/:databaseId/schema/:schemaName/segmented/group/:groupId",
    "/admin/permissions/data/database/:databaseId/schema/:schemaName/table/:tableId/impersonated/group/:groupId",
    "/admin/permissions/data/database/:databaseId/schema/:schemaName/table/:tableId/segmented/group/:groupId",
    "/admin/permissions/data/database/:databaseId/segmented/group/:groupId",
    "/admin/permissions/data/database/:databaseId/table/:tableId/impersonated/group/:groupId",
    "/admin/permissions/data/database/:databaseId/table/:tableId/segmented/group/:groupId",
    "/admin/permissions/data/database/impersonated/group/:groupId",
    "/admin/permissions/data/database/segmented/group/:groupId",
    "/admin/permissions/data/group/:groupId/:tableId/segmented",
    "/admin/permissions/data/group/:groupId/database/:databaseId/:tableId/segmented",
    "/admin/permissions/data/group/:groupId/database/:databaseId/impersonated/database/:impersonatedDatabaseId",
    "/admin/permissions/data/group/:groupId/database/:databaseId/schema/:schemaName/:tableId/segmented",
    "/admin/permissions/data/group/:groupId/database/:databaseId/schema/:schemaName/impersonated/database/:impersonatedDatabaseId",
    "/admin/permissions/data/group/:groupId/impersonated/database/:impersonatedDatabaseId",
    "/admin/permissions/data/group/:tableId/segmented",
    "/admin/permissions/data/group/impersonated/database/:impersonatedDatabaseId",
    "/admin/permissions/tenant-collections",
    "/admin/permissions/tenant-collections/:collectionId",
    "/admin/permissions/tenant-specific-collections",
    "/admin/permissions/tenant-specific-collections/:collectionId",
    "/admin/security-center",
    "/apps/:name",
    "/apps/:name/*",
    "/browse/databases/:dbId/tables/:tableId/edit/:objectId?",
    "/collection/:slug/cleanup",
    "/data-studio/data/database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/dependencies",
    "/data-studio/data/database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/dependencies",
    "/data-studio/library/metrics",
    "/data-studio/library/metrics/:cardId",
    "/data-studio/library/metrics/:cardId/dependencies",
    "/data-studio/library/metrics/:cardId/dimensions",
    "/data-studio/library/metrics/:cardId/history",
    "/data-studio/library/metrics/:cardId/overview",
    "/data-studio/library/metrics/:cardId/query",
    "/data-studio/library/metrics/new",
    "/data-studio/library/tables",
    "/data-studio/library/tables/:tableId",
    "/data-studio/library/tables/:tableId/dependencies",
    "/data-studio/library/tables/:tableId/fields",
    "/data-studio/library/tables/:tableId/fields/:fieldId",
    "/data-studio/library/tables/:tableId/measures",
    "/data-studio/library/tables/:tableId/measures/:measureId",
    "/data-studio/library/tables/:tableId/measures/:measureId/dependencies",
    "/data-studio/library/tables/:tableId/measures/:measureId/revisions",
    "/data-studio/library/tables/:tableId/measures/new",
    "/data-studio/library/tables/:tableId/segments",
    "/data-studio/library/tables/:tableId/segments/:segmentId",
    "/data-studio/library/tables/:tableId/segments/:segmentId/dependencies",
    "/data-studio/library/tables/:tableId/segments/:segmentId/revisions",
    "/data-studio/library/tables/:tableId/segments/new",
    "/data-studio/snippets/:snippetId/dependencies",
    "/data-studio/transforms/:transformId/dependencies",
    "/data-studio/transforms/tools",
    "/data-studio/transforms/tools/migrate-models",
    "/embedding/permissions/application",
    "/embedding/permissions/data/database/:databaseId/impersonated/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/schema/:schemaName/impersonated/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/schema/:schemaName/segmented/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/schema/:schemaName/table/:tableId/impersonated/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/schema/:schemaName/table/:tableId/segmented/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/segmented/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/table/:tableId/impersonated/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/table/:tableId/segmented/group/:groupId",
    "/embedding/permissions/data/database/impersonated/group/:groupId",
    "/embedding/permissions/data/database/segmented/group/:groupId",
    "/embedding/permissions/data/group/:groupId/:tableId/segmented",
    "/embedding/permissions/data/group/:groupId/database/:databaseId/:tableId/segmented",
    "/embedding/permissions/data/group/:groupId/database/:databaseId/impersonated/database/:impersonatedDatabaseId",
    "/embedding/permissions/data/group/:groupId/database/:databaseId/schema/:schemaName/:tableId/segmented",
    "/embedding/permissions/data/group/:groupId/database/:databaseId/schema/:schemaName/impersonated/database/:impersonatedDatabaseId",
    "/embedding/permissions/data/group/:groupId/impersonated/database/:impersonatedDatabaseId",
    "/embedding/permissions/data/group/:tableId/segmented",
    "/embedding/permissions/data/group/impersonated/database/:impersonatedDatabaseId",
    "/embedding/permissions/tenant-collections",
    "/embedding/permissions/tenant-collections/:collectionId",
    "/embedding/permissions/tenant-specific-collections",
    "/embedding/permissions/tenant-specific-collections/:collectionId",
    "/embedding/tenancy/:tenantId",
    "/embedding/tenancy/:tenantId/deactivate",
    "/embedding/tenancy/:tenantId/edit",
    "/embedding/tenancy/:tenantId/reactivate",
    "/embedding/tenancy/groups",
    "/embedding/tenancy/groups/:groupId",
    "/embedding/tenancy/new",
    "/embedding/tenancy/people",
    "/embedding/tenancy/people/:userId",
    "/embedding/tenancy/people/:userId/deactivate",
    "/embedding/tenancy/people/:userId/edit",
    "/embedding/tenancy/people/:userId/reactivate",
    "/embedding/tenancy/people/:userId/reset",
    "/embedding/tenancy/people/:userId/success",
    "/embedding/tenancy/people/:userId/unsubscribe",
    "/embedding/tenancy/people/new",
    "/embedding/tenancy/user-strategy",
    "/metric/:cardId/dependencies",
    "/monitor/ai-auditing",
    "/monitor/ai-auditing/cli",
    "/monitor/ai-auditing/cli/calls",
    "/monitor/ai-auditing/cli/usage",
    "/monitor/ai-auditing/conversations",
    "/monitor/ai-auditing/conversations/:convoId",
    "/monitor/ai-auditing/mcp",
    "/monitor/ai-auditing/mcp/events",
    "/monitor/ai-auditing/mcp/usage",
    "/monitor/ai-auditing/usage",
    "/monitor/ai-auditing/usage/:metric",
    "/monitor/api-key-usage/events",
    "/monitor/api-key-usage/usage",
    "/monitor/content-diagnostics/crowded",
    "/monitor/content-diagnostics/duplicated",
    "/monitor/content-diagnostics/empty",
    "/monitor/content-diagnostics/slow",
    "/monitor/content-diagnostics/sparse",
    "/monitor/content-diagnostics/stale",
    "/monitor/dependency-diagnostics/broken",
    "/monitor/dependency-diagnostics/unreferenced",
    "/monitor/sessions/:sessionId",
  ],
  onlyWithoutFeatures: [
    "/monitor/api-key-usage/*",
    "/monitor/content-diagnostics/*",
    "/monitor/dependency-diagnostics/*",
    "/monitor/sessions/*",
  ],
};

const featuresWith = (enabled: boolean): TokenFeatures => {
  const pairs = Object.keys(createMockTokenFeatures()).map((feature) => [
    feature,
    enabled,
  ]);

  // `fromEntries` widens the keys back to `string`, and every key here comes
  // from the shape of the mock itself.
  return Object.fromEntries(pairs) as TokenFeatures;
};

const storeFor = (tokenFeatures: TokenFeatures) => {
  const store = getStore(mainReducers, {
    settings: createMockSettingsState({ "token-features": tokenFeatures }),
  });

  // The test store satisfies `getRoutes` at runtime but not on paper.
  return store as unknown as Parameters<typeof getRoutes>[0];
};

const treeFor = (tokenFeatures: TokenFeatures) => {
  // Plugins write their slots once, at init, reading MetabaseSettings, so the
  // features have to be in place before they re-register.
  MetabaseSettings.set("token-features", tokenFeatures);
  reinitialize();
  setupEnterprisePlugins();

  return getRoutes(storeFor(tokenFeatures));
};

const patternsOf = (
  routes: RouteObject[],
  prefix = "",
  found = new Set<string>(),
) => {
  for (const route of routes) {
    const path = route.path ?? "";
    const here = path.startsWith("/")
      ? path
      : `${prefix}/${path}`.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    found.add(here);
    patternsOf(route.children ?? [], here === "/" ? "" : here, found);
  }
  return found;
};

describe("the route tree is the same on every instance", () => {
  it("reads no configuration while it is built", () => {
    const tokenFeatures = featuresWith(false);
    MetabaseSettings.set("token-features", tokenFeatures);
    reinitialize();
    setupEnterprisePlugins();

    const store = storeFor(tokenFeatures);
    const reads: string[] = [];

    const settingsSpy = jest
      .spyOn(MetabaseSettings, "get")
      .mockImplementation((key) => {
        reads.push(`MetabaseSettings.get("${String(key)}")`);
        return undefined;
      });
    const stateSpy = jest.spyOn(store, "getState");

    try {
      getRoutes(store);
    } finally {
      settingsSpy.mockRestore();
    }
    if (stateSpy.mock.calls.length > 0) {
      reads.push("store.getState()");
    }
    stateSpy.mockRestore();

    expect([...new Set(reads)].sort()).toEqual(CONFIG_READS_DURING_BUILD);
  });

  it("mounts the same routes with and without token features", () => {
    const withoutFeatures = patternsOf(treeFor(featuresWith(false)));
    const withFeatures = patternsOf(treeFor(featuresWith(true)));

    const received = {
      onlyWithFeatures: [...withFeatures]
        .filter((route) => !withoutFeatures.has(route))
        .sort(),
      onlyWithoutFeatures: [...withoutFeatures]
        .filter((route) => !withFeatures.has(route))
        .sort(),
    };
    expect(received).toEqual(ROUTES_MOUNTED_CONDITIONALLY);
  });
});

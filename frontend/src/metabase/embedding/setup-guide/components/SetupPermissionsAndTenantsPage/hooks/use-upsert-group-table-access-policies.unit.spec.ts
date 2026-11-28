import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  findRequestBodies,
  setupDatabaseListEndpoint,
  setupGroupTableAccessPoliciesEndpoint,
  setupGroupsEndpoint,
  setupPermissionsGraphEndpoints,
  setupTablesEndpoints,
  setupUpdatePermissionsGraphEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import type { GroupTableAccessPolicy } from "metabase-types/api";
import {
  createMockGroup,
  createMockPermissionsGraph,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { useUpsertGroupTableAccessPolicies } from "./use-upsert-group-table-access-policies";

const ALL_USERS_GROUP = createMockGroup();

const ALL_TENANT_USERS_GROUP = createMockGroup({
  id: 3,
  name: "All tenant users",
  magic_group_type: "all-external-users",
});

const SALES_GROUP = createMockGroup({
  id: 4,
  name: "Sales",
  magic_group_type: null,
});

const GROUPS = [ALL_USERS_GROUP, ALL_TENANT_USERS_GROUP, SALES_GROUP];

const SAMPLE_DATABASE = createSampleDatabase();

const createOrdersPolicy = (
  policy: Pick<GroupTableAccessPolicy, "id" | "group_id">,
): GroupTableAccessPolicy => ({
  table_id: ORDERS_ID,
  card_id: null,
  attribute_remappings: {
    region: ["dimension", ["field", ORDERS.USER_ID, null]],
  },
  permission_id: null,
  ...policy,
});

const SALES_ORDERS_POLICY = createOrdersPolicy({
  id: 7,
  group_id: SALES_GROUP.id,
});

const TENANT_ORDERS_POLICY = createOrdersPolicy({
  id: 9,
  group_id: ALL_TENANT_USERS_GROUP.id,
});

const TENANT_ORDERS_REMAPPINGS = {
  organization_id: ["dimension", ["field", ORDERS.USER_ID, null]],
};

interface SetupOpts {
  existingPolicies: GroupTableAccessPolicy[];
}

const setup = ({ existingPolicies }: SetupOpts) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ tenants: true }),
    "use-tenants": true,
  });
  setupEnterpriseOnlyPlugin("tenants");

  setupGroupsEndpoint(GROUPS);
  setupGroupTableAccessPoliciesEndpoint(existingPolicies);
  setupTablesEndpoints(SAMPLE_DATABASE.tables ?? []);
  setupDatabaseListEndpoint([SAMPLE_DATABASE]);
  setupPermissionsGraphEndpoints(GROUPS, [SAMPLE_DATABASE]);
  setupUpdatePermissionsGraphEndpoint(
    createMockPermissionsGraph({
      groups: GROUPS,
      databases: [SAMPLE_DATABASE],
    }),
  );

  return renderHookWithProviders(
    () =>
      useUpsertGroupTableAccessPolicies({
        tableColumnSelections: [
          { tableId: ORDERS_ID, columnId: ORDERS.USER_ID },
        ],
      }),
    { storeInitialState: createMockState({ settings }) },
  );
};

describe("useUpsertGroupTableAccessPolicies", () => {
  it("creates a tenant users sandbox when only another group sandboxes the table", async () => {
    const { result } = setup({ existingPolicies: [SALES_ORDERS_POLICY] });
    await waitFor(() => expect(result.current.existingPolicies).toBeDefined());

    await act(() => result.current.handleUpsertPolicies());

    const savedGraphs = await findRequestBodies({
      method: "PUT",
      urlSuffix: "/api/permissions/graph",
    });
    expect(savedGraphs).toEqual([
      expect.objectContaining({
        sandboxes: [
          {
            table_id: ORDERS_ID,
            group_id: ALL_TENANT_USERS_GROUP.id,
            card_id: null,
            attribute_remappings: TENANT_ORDERS_REMAPPINGS,
          },
        ],
      }),
    ]);
  });

  it("updates the tenant users sandbox when another group's is listed first", async () => {
    const { result } = setup({
      existingPolicies: [SALES_ORDERS_POLICY, TENANT_ORDERS_POLICY],
    });
    await waitFor(() => expect(result.current.existingPolicies).toBeDefined());

    await act(() => result.current.handleUpsertPolicies());

    const savedGraphs = await findRequestBodies({
      method: "PUT",
      urlSuffix: "/api/permissions/graph",
    });
    expect(savedGraphs).toEqual([
      expect.objectContaining({
        sandboxes: [
          {
            id: TENANT_ORDERS_POLICY.id,
            table_id: ORDERS_ID,
            group_id: ALL_TENANT_USERS_GROUP.id,
            card_id: null,
            attribute_remappings: TENANT_ORDERS_REMAPPINGS,
          },
        ],
      }),
    ]);
  });
});

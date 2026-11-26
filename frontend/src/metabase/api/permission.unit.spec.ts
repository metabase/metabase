import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { findRequests } from "__support__/server-mocks";
import type { GroupTableAccessPolicy } from "metabase-types/api";
import { createMockPermissionsGraph } from "metabase-types/api/mocks";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import { Api } from "./api";
import { groupTableAccessPolicyApi } from "./group-table-access-policy";
import { permissionApi } from "./permission";

let activeStore: ReturnType<typeof getStore> | undefined;

function setup() {
  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;
  return { store };
}

const GRAPH = createMockPermissionsGraph({ groups: [], databases: [] });

const MARKETING_GROUP_ID = 5;

const ORDERS_POLICY_DRAFT: Omit<GroupTableAccessPolicy, "id"> = {
  group_id: MARKETING_GROUP_ID,
  table_id: ORDERS_ID,
  card_id: null,
  attribute_remappings: {
    user_id: [
      "dimension",
      ["field", ORDERS.USER_ID, { "base-type": "type/Integer" }],
      { "stage-number": 0 },
    ],
  },
  permission_id: null,
};

const ORDERS_POLICY: GroupTableAccessPolicy = {
  id: 1,
  ...ORDERS_POLICY_DRAFT,
};

describe("permissionApi data-permissions graph", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("fetches the full graph", async () => {
    fetchMock.get("path:/api/permissions/graph", GRAPH);
    const { store } = setup();

    const { data } = await store.dispatch(
      permissionApi.endpoints.getPermissionsGraph.initiate(),
    );

    expect(data?.revision).toBe(1);
    const [request] = await findRequests("GET");
    expect(request.url).toContain("/api/permissions/graph");
  });

  it("fetches the graph for a single group", async () => {
    fetchMock.get("path:/api/permissions/graph/group/5", GRAPH);
    const { store } = setup();

    await store.dispatch(
      permissionApi.endpoints.getGroupPermissionsGraph.initiate(5),
    );

    const [request] = await findRequests("GET");
    expect(request.url).toContain("/api/permissions/graph/group/5");
  });

  it("fetches the graph for a single database", async () => {
    fetchMock.get("path:/api/permissions/graph/db/9", GRAPH);
    const { store } = setup();

    await store.dispatch(
      permissionApi.endpoints.getDatabasePermissionsGraph.initiate(9),
    );

    const [request] = await findRequests("GET");
    expect(request.url).toContain("/api/permissions/graph/db/9");
  });

  it("updates the graph", async () => {
    fetchMock.put("path:/api/permissions/graph", GRAPH);
    const { store } = setup();

    const body = { groups: {}, revision: 1 };
    await store.dispatch(
      permissionApi.endpoints.updatePermissionsGraph.initiate(body),
    );

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });
    const [request] = await findRequests("PUT");
    expect(request.url).toContain("/api/permissions/graph");
    expect(request.body).toEqual(body);
  });

  it("refetches a row and column security policy after the graph saves it", async () => {
    let storedPolicy: GroupTableAccessPolicy | null = null;
    fetchMock.get("path:/api/mt/gtap", () => storedPolicy ?? 204);
    fetchMock.put("path:/api/permissions/graph", () => {
      storedPolicy = ORDERS_POLICY;
      return GRAPH;
    });
    const { store } = setup();
    const { getGroupTableAccessPolicy } = groupTableAccessPolicyApi.endpoints;
    const policyParams = { group_id: MARKETING_GROUP_ID, table_id: ORDERS_ID };

    const beforeSave = store.dispatch(
      getGroupTableAccessPolicy.initiate(policyParams),
    );
    expect((await beforeSave).data).toBeNull();
    beforeSave.unsubscribe();

    await store.dispatch(
      permissionApi.endpoints.updatePermissionsGraph.initiate({
        groups: {},
        revision: 1,
        sandboxes: [ORDERS_POLICY_DRAFT],
      }),
    );

    const afterSave = store.dispatch(
      getGroupTableAccessPolicy.initiate(policyParams),
    );
    expect((await afterSave).data).toEqual(ORDERS_POLICY);
    afterSave.unsubscribe();
  });
});

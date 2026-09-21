import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { findRequests } from "__support__/server-mocks";
import { createMockPermissionsGraph } from "metabase-types/api/mocks";

import { Api } from "./api";
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
});

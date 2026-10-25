import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import {
  findRequests,
  setupCollectionPermissionsGraphEndpoint,
  setupPermissionsGraphEndpoints,
  setupUpdatePermissionsGraphEndpoint,
} from "__support__/server-mocks";
import {
  createMockGroup,
  createMockPermissionsGraph,
} from "metabase-types/api/mocks";

import { Api } from "./api";
import { collectionApi } from "./collection";
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

describe("permission graph cache", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
  });

  it("refetches subscribed data permission graphs after a save", async () => {
    const group = createMockGroup({ id: 5 });
    setupPermissionsGraphEndpoints([group], []);
    setupUpdatePermissionsGraphEndpoint({ ...GRAPH, revision: 2 });
    const { store } = setup();
    store.dispatch(
      permissionApi.endpoints.getGroupPermissionsGraph.initiate(group.id),
    );
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/permissions/graph/group/5"),
      ).toHaveLength(1),
    );

    await store.dispatch(
      permissionApi.endpoints.updatePermissionsGraph.initiate({
        groups: {},
        revision: 1,
      }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/permissions/graph/group/5"),
      ).toHaveLength(2),
    );
  });

  it("refetches subscribed collection permission graphs after a save", async () => {
    setupCollectionPermissionsGraphEndpoint({ groups: {}, revision: 1 });
    const { store } = setup();
    store.dispatch(
      collectionApi.endpoints.getCollectionPermissionsGraph.initiate(),
    );

    await store.dispatch(
      collectionApi.endpoints.updateCollectionPermissionsGraph.initiate({
        groups: {},
        revision: 1,
      }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/collection/graph", {
          method: "GET",
        }),
      ).toHaveLength(2),
    );
  });
});

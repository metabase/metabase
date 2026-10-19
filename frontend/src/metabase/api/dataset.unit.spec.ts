import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { PLUGIN_API, reinitializeRequestHandlers } from "metabase/api/client";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import {
  type McpUiAuth,
  setCurrentMcpQueryHandle,
  setMcpCredentialRefresher,
} from "metabase/embedding-sdk/mcp-app-queries";
import type { DatasetQuery } from "metabase-types/api";
import { createMockCardQueryMetadata } from "metabase-types/api/mocks";

import { Api } from "./api";
import { datasetApi } from "./dataset";

const QUERY: DatasetQuery = {
  database: 1,
  type: "query",
  query: { "source-table": 1 },
};

type SetupOpts = {
  isMcpApp?: boolean;
  handle?: string | null;
};

function setup({ isMcpApp = true, handle = "handle-1" }: SetupOpts = {}) {
  EMBEDDING_SDK_CONFIG.isMcpApp = isMcpApp;
  setCurrentMcpQueryHandle(handle);
  useCredential({ credential: "credential-1", sessionId: "s-1" });

  const refresher = jest.fn(async (): Promise<McpUiAuth> => {
    const auth = { credential: "credential-2", sessionId: "s-1" };
    useCredential(auth);
    return auth;
  });
  setMcpCredentialRefresher(refresher);

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);

  return { store, refresher };
}

function useCredential(auth: McpUiAuth) {
  PLUGIN_API.onBeforeRequestHandlers.setEmbeddingRequestAuthHeaders =
    async () => ({
      headers: {
        "X-Metabase-Mcp-Ui-Auth": auth.credential,
        "Mcp-Session-Id": auth.sessionId,
      },
    });
}

const credentialsSent = (route: string) =>
  fetchMock.callHistory
    .calls(route)
    .map((call) =>
      new Headers(call.options.headers).get("X-Metabase-Mcp-Ui-Auth"),
    );

const refuseFirstCredential = (route: string) =>
  fetchMock.post(route, ({ options }) =>
    new Headers(options.headers).get("X-Metabase-Mcp-Ui-Auth") ===
    "credential-1"
      ? 401
      : { data: { rows: [] } },
  );

afterEach(() => {
  EMBEDDING_SDK_CONFIG.isMcpApp = false;
  setCurrentMcpQueryHandle(null);
  setMcpCredentialRefresher(null);
  reinitializeRequestHandlers();
  fetchMock.removeRoutes().clearHistory();
});

describe("ad-hoc dataset requests in the MCP App iframe", () => {
  const RUN_URL = "path:/api/embed-mcp/queries/handle-1/run";

  it("sends each ad-hoc query request to the current handle's matching route", async () => {
    const { store } = setup();
    const routeUrl = (route: string) =>
      `path:/api/embed-mcp/queries/handle-1/${route}`;
    fetchMock.post(routeUrl("run"), {});
    fetchMock.post(routeUrl("pivot"), {});
    fetchMock.post(routeUrl("query_metadata"), createMockCardQueryMetadata());

    await store
      .dispatch(datasetApi.endpoints.getAdhocQuery.initiate(QUERY))
      .unwrap();
    await store
      .dispatch(datasetApi.endpoints.getAdhocPivotQuery.initiate(QUERY))
      .unwrap();
    await store
      .dispatch(datasetApi.endpoints.getAdhocQueryMetadata.initiate(QUERY))
      .unwrap();

    expect(fetchMock.callHistory.calls(routeUrl("run"))).toHaveLength(1);
    expect(fetchMock.callHistory.calls(routeUrl("pivot"))).toHaveLength(1);
    expect(
      fetchMock.callHistory.calls(routeUrl("query_metadata")),
    ).toHaveLength(1);
  });

  it("goes to /api/dataset outside the iframe", async () => {
    const { store } = setup({ isMcpApp: false });
    fetchMock.post("path:/api/dataset", { data: { rows: [] } });

    await store
      .dispatch(datasetApi.endpoints.getAdhocQuery.initiate(QUERY))
      .unwrap();

    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(1);
  });

  it("goes to /api/dataset before any handle is shown, so the server refuses it", async () => {
    const { store } = setup({ handle: null });
    fetchMock.post("path:/api/dataset", 401);

    await expect(
      store
        .dispatch(datasetApi.endpoints.getAdhocQuery.initiate(QUERY))
        .unwrap(),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("refreshes the credential once and resends the refused run with the new one", async () => {
    const { store, refresher } = setup();
    refuseFirstCredential(RUN_URL);

    await expect(
      store
        .dispatch(datasetApi.endpoints.getAdhocQuery.initiate(QUERY))
        .unwrap(),
    ).resolves.toEqual({ data: { rows: [] } });

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(credentialsSent(RUN_URL)).toEqual(["credential-1", "credential-2"]);
  });

  it("shares one refresh between two concurrent refusals, and resends both", async () => {
    const { store, refresher } = setup();
    refuseFirstCredential(RUN_URL);

    await Promise.all([
      store
        .dispatch(
          datasetApi.endpoints.getAdhocQuery.initiate({
            ...QUERY,
            __rtkCacheKey: 1,
          }),
        )
        .unwrap(),
      store
        .dispatch(
          datasetApi.endpoints.getAdhocQuery.initiate({
            ...QUERY,
            __rtkCacheKey: 2,
          }),
        )
        .unwrap(),
    ]);

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(credentialsSent(RUN_URL)).toEqual([
      "credential-1",
      "credential-1",
      "credential-2",
      "credential-2",
    ]);
  });

  it("resends at most once, so a credential the server keeps refusing ends in the 401", async () => {
    const { store, refresher } = setup();
    fetchMock.post(RUN_URL, 401);

    await expect(
      store
        .dispatch(datasetApi.endpoints.getAdhocQuery.initiate(QUERY))
        .unwrap(),
    ).rejects.toMatchObject({ status: 401 });

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock.callHistory.calls(RUN_URL)).toHaveLength(2);
  });

  it("does not resend when the refresh fails", async () => {
    const { store, refresher } = setup();
    refresher.mockRejectedValue(new Error("host refused"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.post(RUN_URL, 401);

    await expect(
      store
        .dispatch(datasetApi.endpoints.getAdhocQuery.initiate(QUERY))
        .unwrap(),
    ).rejects.toMatchObject({ status: 401 });

    expect(fetchMock.callHistory.calls(RUN_URL)).toHaveLength(1);
  });
});

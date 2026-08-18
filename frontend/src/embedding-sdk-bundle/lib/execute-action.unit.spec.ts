import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { Api } from "metabase/api";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

import { executeAction } from "./execute-action";

const NUMERIC_ID = 42;
const ENTITY_ID = "abc123def456abc123def";

let activeStore: ReturnType<typeof getStore> | undefined;

// `executeAction` dispatches the `metabase/api` execute-action mutation, so it
// needs a real store wired with the RTK Query `Api` reducer + middleware.
function setup() {
  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;
  // The test store is built from the main-app `State`, so it does not carry the
  // SDK-only slices of `SdkStoreState`. `executeAction` only ever touches
  // `dispatch`, which is compatible.
  return store as unknown as SdkStore;
}

describe("executeAction", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
    EMBEDDING_SDK_CONFIG.isDataApp = false;
    EMBEDDING_SDK_CONFIG.isDataAppDev = false;
  });

  describe("a synchronized action definition", () => {
    const AUTHORED_ID = 51;
    const COPIED_ID = 91;
    const definition = {
      action: { id: AUTHORED_ID },
      copiedActionId: COPIED_ID,
    };

    const expectExecuted = async (
      id: number,
      actionId: Parameters<ReturnType<typeof executeAction>>[0]["actionId"],
    ) => {
      fetchMock.post(`path:/api/action/${id}/execute`, {
        status: 200,
        body: { "rows-affected": 1 },
      });

      await executeAction(setup())({ actionId });

      expect(
        fetchMock.callHistory.calls(`path:/api/action/${id}/execute`),
      ).toHaveLength(1);
    };

    it("runs the copy in a production build", async () => {
      EMBEDDING_SDK_CONFIG.isDataApp = true;

      await expectExecuted(COPIED_ID, definition);
    });

    it("runs the authored action in the dev preview", async () => {
      EMBEDDING_SDK_CONFIG.isDataAppDev = true;

      await expectExecuted(AUTHORED_ID, definition);
    });

    it("runs the authored action outside a data app, where no copy exists", async () => {
      await expectExecuted(AUTHORED_ID, { action: { id: AUTHORED_ID } });
    });

    it("refuses an unsynchronized definition in a production build", async () => {
      EMBEDDING_SDK_CONFIG.isDataApp = true;

      await expect(
        executeAction(setup())({ actionId: { action: { id: AUTHORED_ID } } }),
      ).rejects.toThrow("has not been synchronized");
    });

    it("refuses a raw id inside a data app", async () => {
      EMBEDDING_SDK_CONFIG.isDataApp = true;

      await expect(
        executeAction(setup())({ actionId: AUTHORED_ID }),
      ).rejects.toThrow("passed to `useAction` as a raw id");
    });

    it("refuses a raw id in the dev preview, before it can reach production", async () => {
      EMBEDDING_SDK_CONFIG.isDataApp = true;
      EMBEDDING_SDK_CONFIG.isDataAppDev = true;

      await expect(
        executeAction(setup())({ actionId: AUTHORED_ID }),
      ).rejects.toThrow("passed to `useAction` as a raw id");
    });
  });

  it("POSTs to /api/action/:id/execute with the given parameters", async () => {
    fetchMock.post(`path:/api/action/${NUMERIC_ID}/execute`, {
      status: 200,
      body: { "rows-affected": 7 },
    });

    const result = await executeAction(setup())({
      actionId: NUMERIC_ID,
      parameters: { id: 1, name: "European" },
    });

    expect(result).toEqual({ "rows-affected": 7 });
    const calls = fetchMock.callHistory.calls(
      `path:/api/action/${NUMERIC_ID}/execute`,
    );
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0].options.body));
    expect(body).toEqual({ parameters: { id: 1, name: "European" } });
  });

  it("defaults `parameters` to `{}` when omitted", async () => {
    fetchMock.post(`path:/api/action/${NUMERIC_ID}/execute`, {
      status: 200,
      body: { "rows-affected": 0 },
    });

    await executeAction(setup())({ actionId: NUMERIC_ID });

    const calls = fetchMock.callHistory.calls(
      `path:/api/action/${NUMERIC_ID}/execute`,
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].options.body))).toEqual({
      parameters: {},
    });
  });

  it("routes the request to /api/action/:eid/execute when given an entity_id string", async () => {
    fetchMock.post(`path:/api/action/${ENTITY_ID}/execute`, {
      status: 200,
      body: { "created-row": { id: 1 } },
    });

    const result = await executeAction(setup())({
      actionId: ENTITY_ID,
      parameters: { name: "Jane" },
    });

    expect(result).toEqual({ "created-row": { id: 1 } });
    expect(
      fetchMock.callHistory.calls(`path:/api/action/${ENTITY_ID}/execute`),
    ).toHaveLength(1);
    // and not to the numeric-id path
    expect(
      fetchMock.callHistory.calls(`path:/api/action/${NUMERIC_ID}/execute`),
    ).toHaveLength(0);
  });

  it("rejects with the client error shape on a non-2xx response", async () => {
    fetchMock.post(`path:/api/action/${NUMERIC_ID}/execute`, {
      status: 403,
      body: { message: "denied" },
    });

    await expect(
      executeAction(setup())({
        actionId: NUMERIC_ID,
        parameters: { id: 1 },
      }),
    ).rejects.toMatchObject({
      status: 403,
      data: { message: "denied" },
    });
  });
});

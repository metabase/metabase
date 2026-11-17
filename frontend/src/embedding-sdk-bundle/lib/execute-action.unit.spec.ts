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

  describe("an action definition", () => {
    const ACTION_ENTITY_ID = "appActionEntity000091";
    const ACTION_ID = 91;
    const definition = {
      entityId: ACTION_ENTITY_ID,
      kind: "row/update" as const,
      table: { id: 3 },
    };

    it("runs the saved action its entity ID names in a data app", async () => {
      EMBEDDING_SDK_CONFIG.isDataApp = true;
      fetchMock.post("path:/api/eid-translation/translate", {
        entity_ids: {
          [ACTION_ENTITY_ID]: { id: ACTION_ID, type: "action", status: "ok" },
        },
      });
      fetchMock.post(`path:/api/action/${ACTION_ID}/execute`, {
        status: 200,
        body: { "rows-updated": [1] },
      });

      const result = await executeAction(setup())({
        actionId: definition,
        parameters: { id: 1 },
      });

      expect(result).toEqual({ "rows-updated": [1] });
      const calls = fetchMock.callHistory.calls(
        `path:/api/action/${ACTION_ID}/execute`,
      );
      expect(calls).toHaveLength(1);
      expect(JSON.parse(String(calls[0].options.body))).toEqual({
        parameters: { id: 1 },
      });
    });

    it("runs the action itself, without saving it, in the dev preview", async () => {
      EMBEDDING_SDK_CONFIG.isDataApp = true;
      EMBEDDING_SDK_CONFIG.isDataAppDev = true;
      fetchMock.post("path:/api/action/execute", {
        status: 200,
        body: { "rows-updated": [1] },
      });

      await executeAction(setup())({
        actionId: definition,
        parameters: { id: 1 },
      });

      const calls = fetchMock.callHistory.calls("path:/api/action/execute");
      expect(calls).toHaveLength(1);
      expect(JSON.parse(String(calls[0].options.body))).toEqual({
        action: {
          name: "row/update",
          type: "implicit",
          kind: "row/update",
          table_id: 3,
        },
        parameters: { id: 1 },
      });
      expect(
        fetchMock.callHistory.calls("path:/api/eid-translation/translate"),
      ).toHaveLength(0);
    });

    it("runs the saved action an older app's definition names by `action.id`", async () => {
      EMBEDDING_SDK_CONFIG.isDataApp = true;
      fetchMock.post("path:/api/eid-translation/translate", {
        entity_ids: {
          [ACTION_ENTITY_ID]: { id: ACTION_ID, type: "action", status: "ok" },
        },
      });
      fetchMock.post(`path:/api/action/${ACTION_ID}/execute`, {
        status: 200,
        body: { "rows-updated": [1] },
      });

      const result = await executeAction(setup())({
        actionId: { action: { id: ACTION_ENTITY_ID } },
        parameters: { id: 1 },
      });

      expect(result).toEqual({ "rows-updated": [1] });
      expect(
        fetchMock.callHistory.calls(`path:/api/action/${ACTION_ID}/execute`),
      ).toHaveLength(1);
    });

    it("refuses a raw id inside a data app", async () => {
      EMBEDDING_SDK_CONFIG.isDataApp = true;

      await expect(
        executeAction(setup())({ actionId: NUMERIC_ID }),
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

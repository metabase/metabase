import fetchMock from "fetch-mock";

import type { SdkStore } from "embedding-sdk-bundle/store/types";

import { executeAction } from "./execute-action";

// `executeAction` doesn't read the store today — the curried `(store) => fn`
// shape is preserved for parity with the other bundle utilities. Pass a
// minimal stub.
const NOOP_STORE = {} as unknown as SdkStore;

const NUMERIC_ID = 42;
const ENTITY_ID = "abc123def456abc123def";

describe("executeAction", () => {
  it("POSTs to /api/action/:id/execute with the given parameters", async () => {
    fetchMock.post(`path:/api/action/${NUMERIC_ID}/execute`, {
      status: 200,
      body: { "rows-affected": 7 },
    });

    const result = await executeAction(NOOP_STORE)({
      actionId: NUMERIC_ID,
      parameters: { id: 1, name: "European" },
    });

    expect(result).toEqual({ "rows-affected": 7 });
    const calls = fetchMock.callHistory.calls(
      `path:/api/action/${NUMERIC_ID}/execute`,
    );
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].options.body as string);
    expect(body).toEqual({ parameters: { id: 1, name: "European" } });
  });

  it("defaults `parameters` to `{}` when omitted", async () => {
    fetchMock.post(`path:/api/action/${NUMERIC_ID}/execute`, {
      status: 200,
      body: { "rows-affected": 0 },
    });

    await executeAction(NOOP_STORE)({ actionId: NUMERIC_ID });

    const calls = fetchMock.callHistory.calls(
      `path:/api/action/${NUMERIC_ID}/execute`,
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].options.body as string)).toEqual({
      parameters: {},
    });
  });

  it("routes the request to /api/action/:eid/execute when given an entity_id string", async () => {
    fetchMock.post(`path:/api/action/${ENTITY_ID}/execute`, {
      status: 200,
      body: { "created-row": { id: 1 } },
    });

    const result = await executeAction(NOOP_STORE)({
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

  it("rejects with the legacy-client error shape on a non-2xx response", async () => {
    fetchMock.post(`path:/api/action/${NUMERIC_ID}/execute`, {
      status: 403,
      body: { message: "denied" },
    });

    await expect(
      executeAction(NOOP_STORE)({
        actionId: NUMERIC_ID,
        parameters: { id: 1 },
      }),
    ).rejects.toMatchObject({
      status: 403,
      data: { message: "denied" },
    });
  });
});

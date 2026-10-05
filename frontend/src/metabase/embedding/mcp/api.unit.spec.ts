import fetchMock from "fetch-mock";

import { deriveMcpQuery, fetchMcpBootstrap, storeDrillQuery } from "./api";

const INSTANCE_URL = "http://localhost:3000";
const BOOTSTRAP_URL = `${INSTANCE_URL}/api/embed-mcp/bootstrap`;

const OPTIONS = {
  instanceUrl: INSTANCE_URL,
  uiCredential: "credential-1",
  mcpSessionId: "session-1",
};

const sentHeader = (name: string) => {
  const [call] = fetchMock.callHistory.calls();
  return new Headers(call.options.headers).get(name);
};

describe("fetchMcpBootstrap", () => {
  it("authenticates with the UI credential and the MCP session it was minted for", async () => {
    const body = { user: { id: 1 }, settings: { "site-locale": "en" } };
    fetchMock.get(BOOTSTRAP_URL, body);

    await expect(fetchMcpBootstrap(OPTIONS)).resolves.toEqual(body);

    expect(sentHeader("x-metabase-mcp-ui-auth")).toBe("credential-1");
    expect(sentHeader("mcp-session-id")).toBe("session-1");
  });

  it("carries the status on the error so a rejected credential is not reported as a network failure", async () => {
    fetchMock.get(BOOTSTRAP_URL, 401);

    await expect(fetchMcpBootstrap(OPTIONS)).rejects.toMatchObject({
      status: 401,
    });
  });
});

const sentBody = () => {
  const [call] = fetchMock.callHistory.calls();
  return JSON.parse(String(call.options.body));
};

describe("deriveMcpQuery", () => {
  const DERIVE_URL = `${INSTANCE_URL}/api/embed-mcp/queries/handle-1/derive`;

  it("sends the operations against the handle, never a query", async () => {
    fetchMock.post(DERIVE_URL, { handle: "handle-2", query: "ZW5jb2RlZA==" });

    await expect(
      deriveMcpQuery({
        ...OPTIONS,
        queryHandle: "handle-1",
        operations: [{ type: "temporal-bucket/set", unit: "month" }],
      }),
    ).resolves.toEqual({ handle: "handle-2", query: "ZW5jb2RlZA==" });

    expect(sentBody()).toEqual({
      operations: [{ type: "temporal-bucket/set", unit: "month" }],
    });
    expect(sentHeader("x-metabase-mcp-ui-auth")).toBe("credential-1");
    expect(sentHeader("mcp-session-id")).toBe("session-1");
  });

  it("carries the server's explanation on the error", async () => {
    fetchMock.post(DERIVE_URL, {
      status: 400,
      body: "This click offers no sort drill.",
    });

    await expect(
      deriveMcpQuery({
        ...OPTIONS,
        queryHandle: "handle-1",
        operations: [{ type: "date-filter/clear" }],
      }),
    ).rejects.toMatchObject({
      status: 400,
      serverMessage: "This click offers no sort drill.",
    });
  });

  it("carries the status on the error", async () => {
    fetchMock.post(DERIVE_URL, 400);

    await expect(
      deriveMcpQuery({
        ...OPTIONS,
        queryHandle: "handle-1",
        operations: [{ type: "date-filter/clear" }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("storeDrillQuery", () => {
  it("sends the handle and the drill, never a query", async () => {
    fetchMock.post(`${INSTANCE_URL}/api/embed-mcp/drills`, {
      handle: "drill-handle",
    });

    const operation = {
      type: "drill-thru",
      drill: "underlying-records",
      context: { column: "count", value: 8 },
    } as const;

    await expect(
      storeDrillQuery({ ...OPTIONS, queryHandle: "handle-1", operation }),
    ).resolves.toEqual({ handle: "drill-handle" });

    expect(sentBody()).toEqual({ handle: "handle-1", operation });
  });
});

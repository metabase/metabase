import fetchMock from "fetch-mock";

import { resolveMcpQuery } from "./api";

describe("resolveMcpQuery", () => {
  beforeEach(() => {
    fetchMock.post("path:/api/embed-mcp/query", {
      query: "encoded-query",
      prompt: "show orders",
    });
  });

  afterEach(() => {
    fetchMock.clearHistory();
  });

  it("resolves a handle using the MCP UI credential", async () => {
    await expect(
      resolveMcpQuery({
        instanceUrl: "https://metabase.example",
        uiCredential: "ui-credential",
        mcpSessionId: "mcp-session-id",
        queryHandle: "query-handle",
      }),
    ).resolves.toEqual({ query: "encoded-query", prompt: "show orders" });

    const request = fetchMock.callHistory.lastCall(
      "path:/api/embed-mcp/query",
      { method: "POST" },
    );

    expect(request?.options?.headers).toMatchObject({
      "x-metabase-mcp-ui-auth": "ui-credential",
      "mcp-session-id": "mcp-session-id",
    });
    // fetch-mock exposes RequestInit.body as BodyInit, but this client always sends a JSON string.
    expect(JSON.parse(request?.options?.body as string)).toEqual({
      query_handle: "query-handle",
    });
  });
});

import fetchMock from "fetch-mock";

import { resolveMcpQueryHandle } from "./api";

describe("resolveMcpQueryHandle", () => {
  beforeEach(() => {
    fetchMock.post("path:/api/embed-mcp/query-handle/resolve", {
      query: "encoded-query",
      prompt: "show orders",
    });
  });

  afterEach(() => {
    fetchMock.clearHistory();
  });

  it("resolves a query handle using the MCP UI credential", async () => {
    await expect(
      resolveMcpQueryHandle({
        instanceUrl: "https://metabase.example",
        uiCredential: "ui-credential",
        mcpSessionId: "mcp-session-id",
        queryHandle: "query-handle",
      }),
    ).resolves.toEqual({ query: "encoded-query", prompt: "show orders" });

    const request = fetchMock.callHistory.lastCall(
      "path:/api/embed-mcp/query-handle/resolve",
      { method: "POST" },
    );

    expect(request?.options?.headers).toMatchObject({
      "x-metabase-mcp-ui-auth": "ui-credential",
      "mcp-session-id": "mcp-session-id",
    });

    expect(request?.options?.body).toBe(
      JSON.stringify({ query_handle: "query-handle" }),
    );
  });
});

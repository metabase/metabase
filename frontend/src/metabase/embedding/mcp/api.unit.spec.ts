import fetchMock from "fetch-mock";

import { fetchMcpBootstrap } from "./api";

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

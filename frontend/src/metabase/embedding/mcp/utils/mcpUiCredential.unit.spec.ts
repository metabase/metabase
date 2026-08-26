import { getMcpUiAuth } from "./mcpUiCredential";

describe("getMcpUiAuth", () => {
  it("reads the credential and session from private tool-result metadata", () => {
    expect(
      getMcpUiAuth({
        "com.metabase/mcp-apps": {
          credential: "fresh-credential",
          refreshTool: "refresh_visualize_query_ui_credential",
          sessionId: "mcp-session-id",
        },
      }),
    ).toEqual({
      credential: "fresh-credential",
      refreshTool: "refresh_visualize_query_ui_credential",
      sessionId: "mcp-session-id",
    });
  });

  it("rejects missing and malformed auth metadata", () => {
    expect(getMcpUiAuth(undefined)).toBeNull();
    expect(getMcpUiAuth({ "com.metabase/mcp-apps": {} })).toBeNull();
    expect(
      getMcpUiAuth({
        "com.metabase/mcp-apps": {
          credential: 123,
          refreshTool: "refresh_visualize_query_ui_credential",
          sessionId: "mcp-session-id",
        },
      }),
    ).toBeNull();
  });
});

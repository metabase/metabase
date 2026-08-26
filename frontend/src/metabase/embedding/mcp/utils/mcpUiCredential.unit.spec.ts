import { getMcpUiAuth } from "./mcpUiCredential";

describe("getMcpUiAuth", () => {
  it("reads the credential and session from private tool-result metadata", () => {
    expect(
      getMcpUiAuth({
        "com.metabase/mcp-ui": {
          credential: "fresh-credential",
          sessionId: "mcp-session-id",
        },
      }),
    ).toEqual({
      credential: "fresh-credential",
      sessionId: "mcp-session-id",
    });
  });

  it("rejects missing and malformed auth metadata", () => {
    expect(getMcpUiAuth(undefined)).toBeNull();
    expect(getMcpUiAuth({ "com.metabase/mcp-ui": {} })).toBeNull();
    expect(
      getMcpUiAuth({
        "com.metabase/mcp-ui": {
          credential: 123,
          sessionId: "mcp-session-id",
        },
      }),
    ).toBeNull();
  });
});

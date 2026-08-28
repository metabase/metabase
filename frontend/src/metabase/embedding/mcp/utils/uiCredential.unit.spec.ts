import { getMcpUiAuthFromToolMetadata } from "./uiCredential";

describe("getMcpUiAuth", () => {
  it("reads the credential and session from private tool-result metadata", () => {
    expect(
      getMcpUiAuthFromToolMetadata({
        "com.metabase/mcp-apps": {
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
    expect(getMcpUiAuthFromToolMetadata(undefined)).toBeNull();
    expect(
      getMcpUiAuthFromToolMetadata({ "com.metabase/mcp-apps": {} }),
    ).toBeNull();
    expect(
      getMcpUiAuthFromToolMetadata({
        "com.metabase/mcp-apps": {
          credential: 123,
          sessionId: "mcp-session-id",
        },
      }),
    ).toBeNull();
  });
});

import { getMcpUiAuthFromToolMetadata } from "./uiCredential";

describe("getMcpUiAuth", () => {
  it("reads the credential and session from the tool result metadata", () => {
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

  it("ignores incorrect auth metadata", () => {
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

import { getCredentialFromToolResultMetadata } from "./mcpUiAuth";

describe("getCredentialFromToolResultMetadata", () => {
  it("reads the credential and session from the tool result metadata", () => {
    expect(
      getCredentialFromToolResultMetadata({
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
    expect(getCredentialFromToolResultMetadata(undefined)).toBeNull();

    expect(
      getCredentialFromToolResultMetadata({ "com.metabase/mcp-apps": {} }),
    ).toBeNull();

    expect(
      getCredentialFromToolResultMetadata({
        "com.metabase/mcp-apps": {
          credential: 123,
          sessionId: "mcp-session-id",
        },
      }),
    ).toBeNull();
  });
});

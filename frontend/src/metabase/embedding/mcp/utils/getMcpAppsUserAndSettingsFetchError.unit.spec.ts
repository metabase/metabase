import { getMcpAppsUserAndSettingsFetchErrorType } from "./getMcpAppsUserAndSettingsFetchError";

describe("getMcpAppsUserAndSettingsFetchErrorType", () => {
  it("returns auth for unauthorized current user or settings API errors", () => {
    expect(
      getMcpAppsUserAndSettingsFetchErrorType({
        status: 401,
        data: "Unauthenticated",
      }),
    ).toBe("auth");
  });

  it("returns auth when the bootstrap session is expired or mismatched", () => {
    expect(
      getMcpAppsUserAndSettingsFetchErrorType({
        status: 404,
        data: "Invalid or expired session",
      }),
    ).toBe("auth");
  });

  it("returns network when MCP is disabled instance-wide", () => {
    expect(
      getMcpAppsUserAndSettingsFetchErrorType({
        status: 403,
        data: "MCP server is not enabled.",
      }),
    ).toBe("network");
  });

  it("returns network for non-auth current user or settings API errors", () => {
    expect(
      getMcpAppsUserAndSettingsFetchErrorType({
        status: 500,
        data: "Internal server error",
      }),
    ).toBe("network");
  });

  it("returns network for unreadable CORS or network failures", () => {
    expect(
      getMcpAppsUserAndSettingsFetchErrorType(new TypeError("Failed to fetch")),
    ).toBe("network");
  });
});

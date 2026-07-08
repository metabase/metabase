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

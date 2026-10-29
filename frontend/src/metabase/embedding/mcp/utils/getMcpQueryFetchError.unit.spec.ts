import { getMcpQueryFetchErrorType } from "./getMcpQueryFetchError";

describe("getMcpQueryFetchErrorType (GHY-4157)", () => {
  it("returns expired for a handle the store no longer has", () => {
    expect(getMcpQueryFetchErrorType({ status: 404 })).toBe("expired");
  });

  it("returns auth for a reaped or mismatched embedding session", () => {
    expect(getMcpQueryFetchErrorType({ status: 401 })).toBe("auth");
    expect(getMcpQueryFetchErrorType({ status: 403 })).toBe("auth");
  });

  it("returns network for server errors", () => {
    expect(getMcpQueryFetchErrorType({ status: 500 })).toBe("network");
  });

  it("returns network for unreadable CORS or network failures", () => {
    expect(getMcpQueryFetchErrorType(new TypeError("Failed to fetch"))).toBe(
      "network",
    );
  });
});

import { isBackendOnlyPath } from "./redirect-target";

describe("isBackendOnlyPath", () => {
  it("should return true for /oauth/ paths", () => {
    expect(isBackendOnlyPath("/oauth/authorize")).toBe(true);
    expect(isBackendOnlyPath("/oauth/authorize/decision")).toBe(true);
    expect(isBackendOnlyPath("/oauth/token")).toBe(true);
  });

  it("should return true for /auth/sso/ paths", () => {
    expect(isBackendOnlyPath("/auth/sso/slack-connect")).toBe(true);
    expect(isBackendOnlyPath("/auth/sso/slack-connect/callback")).toBe(true);
    expect(isBackendOnlyPath("/auth/sso/my-provider")).toBe(true);
  });

  it("should return false for frontend paths", () => {
    expect(isBackendOnlyPath("/")).toBe(false);
    expect(isBackendOnlyPath("/auth/login")).toBe(false);
    expect(isBackendOnlyPath("/collection/root")).toBe(false);
    expect(isBackendOnlyPath("/question/1")).toBe(false);
  });

  it("should not match partial prefixes", () => {
    expect(isBackendOnlyPath("/oauthx/foo")).toBe(false);
  });
});

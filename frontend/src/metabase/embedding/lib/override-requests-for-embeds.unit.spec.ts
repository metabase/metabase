import { matchUrlPattern } from "./override-requests-for-embeds";

describe("matchUrlPattern", () => {
  it("should match URL with single parameter", () => {
    expect(
      matchUrlPattern("/api/card/:cardId/query", "/api/card/123/query"),
    ).toBe(true);
  });

  it("should not match URL with different path structure", () => {
    expect(
      matchUrlPattern("/api/card/:cardId/query", "/api/card/123/edit"),
    ).toBe(false);
  });

  it("should match URL with multiple parameters", () => {
    expect(
      matchUrlPattern(
        "/api/card/:cardId/params/:paramId/values",
        "/api/card/123/params/456/values",
      ),
    ).toBe(true);
  });

  it("should match card query pattern", () => {
    expect(
      matchUrlPattern("/api/card/:cardId/query", "/api/card/1/query"),
    ).toBe(true);
  });

  it("should match card pivot query pattern", () => {
    expect(
      matchUrlPattern(
        "/api/card/pivot/:cardId/query",
        "/api/card/pivot/123/query",
      ),
    ).toBe(true);
  });

  it("should match card parameter values pattern", () => {
    expect(
      matchUrlPattern(
        "/api/card/:cardId/params/:paramId/values",
        "/api/card/123/params/456/values",
      ),
    ).toBe(true);
  });

  it("should match card parameter search pattern", () => {
    expect(
      matchUrlPattern(
        "/api/card/:cardId/params/:paramId/search/:query",
        "/api/card/123/params/456/search/test",
      ),
    ).toBe(true);
  });

  it("should match card parameter remapping pattern", () => {
    expect(
      matchUrlPattern(
        "/api/card/:cardId/params/:paramId/remapping",
        "/api/card/123/params/456/remapping",
      ),
    ).toBe(true);
  });

  it("should match dashboard parameter values pattern", () => {
    expect(
      matchUrlPattern(
        "/api/dashboard/:dashId/params/:paramId/values",
        "/api/dashboard/789/params/456/values",
      ),
    ).toBe(true);
  });

  it("should match dashboard parameter search pattern", () => {
    expect(
      matchUrlPattern(
        "/api/dashboard/:dashId/params/:paramId/search/:query",
        "/api/dashboard/789/params/456/search/test",
      ),
    ).toBe(true);
  });

  it("should match dashboard parameter remapping pattern", () => {
    expect(
      matchUrlPattern(
        "/api/dashboard/:dashId/params/:paramId/remapping",
        "/api/dashboard/789/params/456/remapping",
      ),
    ).toBe(true);
  });
});

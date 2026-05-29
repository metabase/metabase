import { substituteUrlTags } from "./substitute-url-tags";

describe("substituteUrlTags", () => {
  it("returns the URL unchanged when no tags are present", () => {
    const data = { extra: 1 };
    const url = substituteUrlTags("/api/foo", data, "GET");
    expect(url).toBe("/api/foo");
    expect(data).toEqual({ extra: 1 });
  });

  it("substitutes a single :tag and consumes it from data", () => {
    const data = { id: 42, leftover: "x" };
    const url = substituteUrlTags("/api/foo/:id", data, "GET");
    expect(url).toBe("/api/foo/42");
    expect(data).toEqual({ leftover: "x" });
  });

  it("substitutes multiple :tags in one URL", () => {
    const data = { dashId: 1, paramId: "p" };
    const url = substituteUrlTags(
      "/api/dashboard/:dashId/params/:paramId/values",
      data,
      "GET",
    );
    expect(url).toBe("/api/dashboard/1/params/p/values");
    expect(data).toEqual({});
  });

  it("URL-encodes :tag values by default", () => {
    const data = { id: "a/b c" };
    const url = substituteUrlTags("/api/foo/:id", data, "GET");
    expect(url).toBe("/api/foo/a%2Fb%20c");
  });

  it("substitutes :tag* values raw (preserves slashes)", () => {
    const data = { subPath: "table/3/cell/4" };
    const url = substituteUrlTags(
      "/api/automagic-dashboards/:subPath*",
      data,
      "GET",
    );
    expect(url).toBe("/api/automagic-dashboards/table/3/cell/4");
    expect(data).toEqual({});
  });

  it("mixes :tag (encoded) and :tag* (raw) in the same URL", () => {
    const data = { id: "x/y", path: "a/b/c" };
    const url = substituteUrlTags("/api/:id/sub/:path*", data, "GET");
    expect(url).toBe("/api/x%2Fy/sub/a/b/c");
  });

  it("substitutes empty string and warns when a tag has no value in data", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const data = {};
    const url = substituteUrlTags("/api/foo/:missing", data, "POST");
    expect(url).toBe("/api/foo/");
    expect(warn).toHaveBeenCalledWith(
      "Warning: calling",
      "POST",
      "without",
      ":missing",
    );
    warn.mockRestore();
  });

  it("coerces non-string values to strings before encoding", () => {
    const data = { id: 7, flag: true };
    const url = substituteUrlTags("/api/:id/:flag", data, "GET");
    expect(url).toBe("/api/7/true");
  });
});

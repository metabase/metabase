import { substituteUrlTags } from "./utils";

describe("substituteUrlTags", () => {
  it("returns the URL unchanged when no tags are present", () => {
    const data = { extra: 1 };
    const url = substituteUrlTags("/api/foo", data);
    expect(url).toBe("/api/foo");
    expect(data).toEqual({ extra: 1 });
  });

  it("substitutes a single :tag and consumes it from data", () => {
    const data = { id: 42, leftover: "x" };
    const url = substituteUrlTags("/api/foo/:id", data);
    expect(url).toBe("/api/foo/42");
    expect(data).toEqual({ leftover: "x" });
  });

  it("substitutes multiple :tags in one URL", () => {
    const data = { dashId: 1, paramId: "p" };
    const url = substituteUrlTags(
      "/api/dashboard/:dashId/params/:paramId/values",
      data,
    );
    expect(url).toBe("/api/dashboard/1/params/p/values");
    expect(data).toEqual({});
  });

  it("URL-encodes :tag values by default", () => {
    const data = { id: "a/b c" };
    const url = substituteUrlTags("/api/foo/:id", data);
    expect(url).toBe("/api/foo/a%2Fb%20c");
  });

  it("substitutes empty string and warns when a tag has no value in data", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const data = {};
    const url = substituteUrlTags("/api/foo/:missing", data);
    expect(url).toBe("/api/foo/");
    expect(warn).toHaveBeenCalledWith(
      "Warning: calling",
      "/api/foo/:missing",
      "without",
      ":missing",
    );
    warn.mockRestore();
  });

  it("coerces non-string values to strings before encoding", () => {
    const data = { id: 7, flag: true };
    const url = substituteUrlTags("/api/:id/:flag", data);
    expect(url).toBe("/api/7/true");
  });

  it("falls back to a body field when the tag is absent from data (embed :token)", () => {
    const data = {};
    const body = { token: "THE_JWT", parameters: "[]" };
    const url = substituteUrlTags("/api/embed/card/:token/query", data, body);
    expect(url).toBe("/api/embed/card/THE_JWT/query");
    // consumed from the body, leaving the other body field intact
    expect(body).toEqual({ parameters: "[]" });
    expect(data).toEqual({});
  });

  it("prefers a data value over a body value for the same tag", () => {
    const data = { id: "from-data" };
    const body = { id: "from-body" };
    const url = substituteUrlTags("/api/foo/:id", data, body);
    expect(url).toBe("/api/foo/from-data");
    expect(data).toEqual({});
    // the body value is left untouched since data satisfied the tag
    expect(body).toEqual({ id: "from-body" });
  });
});

import { getPathnameWithoutSubPath } from "./dom";

describe("getPathnameWithoutSubPath", () => {
  it("should leave the pathname unchanged when the site url has no subpath", () => {
    expect(
      getPathnameWithoutSubPath("/dashboard/1", "http://example.com"),
    ).toBe("/dashboard/1");
    expect(
      getPathnameWithoutSubPath("/dashboard/1", "http://example.com/"),
    ).toBe("/dashboard/1");
  });

  it("should strip the subpath from the pathname", () => {
    expect(
      getPathnameWithoutSubPath(
        "/metabase/dashboard/1",
        "http://example.com/metabase",
      ),
    ).toBe("/dashboard/1");
  });

  it("should strip the subpath case-insensitively", () => {
    expect(
      getPathnameWithoutSubPath(
        "/Metabase/dashboard/1",
        "http://example.com/metabase",
      ),
    ).toBe("/dashboard/1");
  });

  it("should not strip a subpath that appears mid-pathname", () => {
    expect(
      getPathnameWithoutSubPath(
        "/dashboard/metabase/1",
        "http://example.com/metabase",
      ),
    ).toBe("/dashboard/metabase/1");
  });

  it("should not strip a subpath that only matches a partial path segment", () => {
    expect(
      getPathnameWithoutSubPath(
        "/metabase2/dashboard/1",
        "http://example.com/metabase",
      ),
    ).toBe("/metabase2/dashboard/1");
  });

  it("should leave a pathname shorter than the subpath unchanged", () => {
    expect(
      getPathnameWithoutSubPath("/metabase", "http://example.com/metabase/sub"),
    ).toBe("/metabase");
  });

  it("should leave the pathname unchanged when the site url is empty", () => {
    expect(getPathnameWithoutSubPath("/dashboard/1", "")).toBe("/dashboard/1");
  });
});

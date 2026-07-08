import { getLocationWithoutBasename } from "./initialize";

describe("getLocationWithoutBasename", () => {
  const originalMetabaseRoot = window.MetabaseRoot;

  afterEach(() => {
    window.MetabaseRoot = originalMetabaseRoot;
  });

  it("strips the sub-path basename so push doesn't double it (metabase EMB-106)", () => {
    window.MetabaseRoot = "/metabase/";

    expect(
      getLocationWithoutBasename({ pathname: "/metabase/auto/dashboard/1" }),
    ).toEqual({ pathname: "/auto/dashboard/1" });
  });

  it("tolerates a basename without a trailing slash", () => {
    window.MetabaseRoot = "/metabase";

    expect(
      getLocationWithoutBasename({ pathname: "/metabase/auto/dashboard/1" }),
    ).toEqual({ pathname: "/auto/dashboard/1" });
  });

  it("maps the basename root to '/'", () => {
    window.MetabaseRoot = "/metabase/";

    expect(getLocationWithoutBasename({ pathname: "/metabase" })).toEqual({
      pathname: "/",
    });
  });

  it("preserves search and hash while stripping the basename", () => {
    window.MetabaseRoot = "/metabase/";

    expect(
      getLocationWithoutBasename({
        pathname: "/metabase/auto/dashboard/1",
        search: "?foo=bar",
        hash: "#baz",
      }),
    ).toEqual({
      pathname: "/auto/dashboard/1",
      search: "?foo=bar",
      hash: "#baz",
    });
  });

  it("does not strip when there is no sub-path", () => {
    window.MetabaseRoot = "/";

    expect(
      getLocationWithoutBasename({ pathname: "/auto/dashboard/1" }),
    ).toEqual({ pathname: "/auto/dashboard/1" });
  });

  it("does not strip a path that only shares a prefix with the basename", () => {
    window.MetabaseRoot = "/metabase/";

    // `/metabased` is not under the `/metabase` basename
    expect(
      getLocationWithoutBasename({ pathname: "/metabased/auto/dashboard/1" }),
    ).toEqual({ pathname: "/metabased/auto/dashboard/1" });
  });

  it("leaves the location untouched when there is no pathname", () => {
    window.MetabaseRoot = "/metabase/";

    expect(getLocationWithoutBasename({ search: "?foo=bar" })).toEqual({
      search: "?foo=bar",
    });
  });
});

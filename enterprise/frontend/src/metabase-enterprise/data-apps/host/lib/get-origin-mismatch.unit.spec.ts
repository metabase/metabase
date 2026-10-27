import { getOriginMismatch } from "./get-origin-mismatch";

const loc = (
  origin: string,
  pathname = "/apps/sales",
  search = "",
  hash = "",
) => ({
  origin,
  hostname: new URL(origin).hostname,
  pathname,
  search,
  hash,
});

describe("getOriginMismatch", () => {
  it("moves a loopback page to the site-url origin, keeping the path", () => {
    expect(
      getOriginMismatch(
        "http://mb.localhost:3000",
        loc("http://localhost:3000", "/apps/sales", "?a=1", "#x"),
      ),
    ).toEqual({
      kind: "redirect",
      url: "http://mb.localhost:3000/apps/sales?a=1#x",
    });
  });

  it("moves an IPv6 loopback page too", () => {
    expect(
      getOriginMismatch("http://mb.localhost:3000", loc("http://[::1]:3000")),
    ).toEqual({
      kind: "redirect",
      url: "http://mb.localhost:3000/apps/sales",
    });
  });

  it("does nothing on the site-url origin", () => {
    expect(
      getOriginMismatch(
        "http://mb.localhost:3000",
        loc("http://mb.localhost:3000"),
      ),
    ).toBeNull();
  });

  it("does not move a page on another production host name, and links to the site URL instead", () => {
    expect(
      getOriginMismatch(
        "https://metabase.acme.com",
        loc("https://bi.acme.com"),
      ),
    ).toEqual({
      kind: "wrong-origin",
      url: "https://metabase.acme.com/apps/sales",
    });
  });

  it("does nothing without a site-url", () => {
    expect(getOriginMismatch(null, loc("http://localhost:3000"))).toBeNull();
  });
});

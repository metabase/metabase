import { getWrongOriginRedirect } from "./get-wrong-origin-redirect";

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

describe("getWrongOriginRedirect", () => {
  it("bounces a wrong-origin loopback page to the site-url origin (path preserved)", () => {
    expect(
      getWrongOriginRedirect(
        true,
        "http://mb.localhost:3000",
        loc("http://localhost:3000", "/apps/sales", "?a=1", "#x"),
      ),
    ).toBe("http://mb.localhost:3000/apps/sales?a=1#x");
  });

  it("stays put when already on the site-url origin", () => {
    expect(
      getWrongOriginRedirect(
        true,
        "http://mb.localhost:3000",
        loc("http://mb.localhost:3000"),
      ),
    ).toBeNull();
  });

  it("never redirects a non-loopback host (production alt hostnames)", () => {
    expect(
      getWrongOriginRedirect(
        true,
        "https://metabase.acme.com",
        loc("https://bi.acme.com"),
      ),
    ).toBeNull();
  });

  it("does nothing in same-origin mode or without a site-url", () => {
    expect(
      getWrongOriginRedirect(
        false,
        "http://mb.localhost:3000",
        loc("http://localhost:3000"),
      ),
    ).toBeNull();
    expect(
      getWrongOriginRedirect(true, null, loc("http://localhost:3000")),
    ).toBeNull();
  });
});

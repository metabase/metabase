import { isSiteUrlMatchingCurrentOrigin } from "./is-site-url-matching-current-origin";

describe("isSiteUrlMatchingCurrentOrigin", () => {
  it("returns true when site URL origin matches the current origin", () => {
    expect(
      isSiteUrlMatchingCurrentOrigin(
        "http://localhost:3000",
        "http://localhost:3000",
      ),
    ).toBe(true);
  });

  it("ignores trailing slashes on the site URL", () => {
    expect(
      isSiteUrlMatchingCurrentOrigin(
        "http://localhost:3000/",
        "http://localhost:3000",
      ),
    ).toBe(true);
  });

  it("returns false when site URL host differs from the current host", () => {
    expect(
      isSiteUrlMatchingCurrentOrigin(
        "http://localhost:3000",
        "http://metabase.localhost:3000",
      ),
    ).toBe(false);
  });

  it("returns false when site URL port differs from the current port", () => {
    expect(
      isSiteUrlMatchingCurrentOrigin(
        "http://localhost:4000",
        "http://localhost:3000",
      ),
    ).toBe(false);
  });

  it("returns false when site URL scheme differs from the current scheme", () => {
    expect(
      isSiteUrlMatchingCurrentOrigin(
        "http://example.com",
        "https://example.com",
      ),
    ).toBe(false);
  });

  it("returns true when the site URL is empty or null (treated as not configured)", () => {
    expect(isSiteUrlMatchingCurrentOrigin("", "http://localhost:3000")).toBe(
      true,
    );
    expect(isSiteUrlMatchingCurrentOrigin(null, "http://localhost:3000")).toBe(
      true,
    );
    expect(
      isSiteUrlMatchingCurrentOrigin(undefined, "http://localhost:3000"),
    ).toBe(true);
  });

  it("returns true when the site URL is malformed (let other validation surface it)", () => {
    expect(
      isSiteUrlMatchingCurrentOrigin("not a url", "http://localhost:3000"),
    ).toBe(true);
  });
});

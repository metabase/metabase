import { mockSettings } from "__support__/settings";

import { getSitePath } from "./dom";

describe("getSitePath", () => {
  it("returns the lower-cased path of site-url", () => {
    mockSettings({ "site-url": "https://example.com/Analytics" });
    expect(getSitePath()).toBe("/analytics");
  });

  it("returns the root path for a site-url without a sub-path", () => {
    mockSettings({ "site-url": "https://example.com" });
    expect(getSitePath()).toBe("/");
  });

  // `site-url` is a public setting with no default, so it is null on instances where it was never set --
  // e.g. ones provisioned by config-from-file, which never run the setup wizard. Throwing here used to
  // white-screen the whole app, since GlobalStyles calls this above any error boundary.
  it.each([null, undefined, ""])(
    "falls back to the root path when site-url is %p",
    (siteUrl) => {
      mockSettings({ "site-url": siteUrl as unknown as string });
      expect(getSitePath()).toBe("/");
    },
  );

  it("falls back to the root path when site-url is not a parseable URL", () => {
    mockSettings({ "site-url": "not a url" });
    expect(getSitePath()).toBe("/");
  });
});

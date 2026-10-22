import { getDataAppEmbedUrl, isEmbeddedDataAppPath } from "./data-app-embed";

describe("embedded data app route", () => {
  it("creates the dedicated runtime URL without a mode flag", () => {
    const url = getDataAppEmbedUrl(
      "https://example.com/mb/",
      "/sales/orders?active=true",
    );
    expect(url.href).toBe(
      "https://example.com/mb/embed/embedded-apps/sales/orders?active=true",
    );
  });

  it.each<[string, string, boolean]>([
    ["/embed/embedded-apps/sales", "/", true],
    ["/mb/embed/embedded-apps/sales/orders", "/mb/", true],
    ["/embed/apps/sales", "/", false],
    ["/embed/apps/sales/embed/embedded-apps/other", "/", false],
    ["/embed/embedded-apps-else/sales", "/", false],
  ])(
    "selects embedding mode for %s under %s: %s",
    (pathname, root, expected) => {
      expect(isEmbeddedDataAppPath({ pathname, root })).toBe(expected);
    },
  );
});

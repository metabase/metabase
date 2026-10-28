import {
  getEmbeddedAppNameFromPath,
  isEmbeddedDataAppPath,
} from "./embedded-data-app-path";

describe("embedded data app route", () => {
  const originalRoot = window.MetabaseRoot;

  afterEach(() => {
    window.MetabaseRoot = originalRoot;
  });

  it("reads the app name from nested routes with query and hash", () => {
    expect(
      getEmbeddedAppNameFromPath("/sales/orders?active=true#details"),
    ).toBe("sales");
  });

  it.each<[string, string, boolean]>([
    ["/embed/embedded-apps/sales", "/", true],
    ["/mb/embed/embedded-apps/sales/orders", "/mb/", true],
    ["/embed/apps/sales", "/", false],
    ["/embed/apps/sales/embed/embedded-apps/other", "/", false],
    ["/embed/embedded-apps-else/sales", "/", false],
  ])(
    "detects embedded data app for %s under %s: %s",
    (pathname, root, expected) => {
      window.MetabaseRoot = root;

      expect(isEmbeddedDataAppPath(pathname)).toBe(expected);
    },
  );

  it.each([
    "sales/../other",
    "sales/%2e%2e/other",
    "sales/%2fother",
    "sales/%",
    "sales\\other",
    "sales/\nother",
    "sales/%00other",
  ])("rejects unsafe paths: %s", (path) => {
    expect(getEmbeddedAppNameFromPath(path)).toBeUndefined();
  });
});

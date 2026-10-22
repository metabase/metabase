import {
  getDataAppNameFromPath,
  isEmbeddedDataAppPath,
} from "./data-app-embed";

describe("embedded data app route", () => {
  it.each([
    "sales/../other",
    "sales/%2e%2e/other",
    "sales/%2fother",
    "sales/%",
    "sales\\other",
    "sales/\nother",
    "sales/%00other",
  ])("rejects unsafe paths: %s", (path) => {
    expect(getDataAppNameFromPath(path)).toBeUndefined();
  });

  it("reads the app name from nested routes with query and hash", () => {
    expect(getDataAppNameFromPath("/sales/orders?active=true#details")).toBe(
      "sales",
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

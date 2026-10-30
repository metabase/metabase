import {
  getDataAppEmbedUrl,
  getEmbeddedAppNameFromPath,
  isEmbeddedDataAppPath,
  normalizeDataAppPath,
  validateDataAppPath,
} from "./embedded-data-app-path";

const UNSAFE_PATHS = [
  "sales/../other",
  "sales/%2e%2e/other",
  "sales/%2fother",
  "sales/%",
  "sales\\other",
  "sales/\nother",
  "sales/%00other",
];

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

  it.each(UNSAFE_PATHS)("rejects unsafe paths: %s", (path) => {
    expect(getEmbeddedAppNameFromPath(path)).toBeUndefined();
  });
});

describe("data app embed urls", () => {
  it("preserves subpath and route", () => {
    const url = getDataAppEmbedUrl(
      "https://metabase.example.com/mb/",
      "///sales/orders?active=true#details",
    );

    expect(url.href).toBe(
      "https://metabase.example.com/mb/embed/embedded-apps/sales/orders?active=true#details",
    );
  });
});

describe("data app paths", () => {
  it("strips leading slashes", () => {
    expect(normalizeDataAppPath("///sales/orders")).toBe("sales/orders");
  });

  it("accepts leading slashes, nested routes, query params and hashes", () => {
    expect(() =>
      validateDataAppPath("///sales/orders?active=true#details"),
    ).not.toThrow();
  });

  it.each(UNSAFE_PATHS)("rejects unsafe paths: %s", (path) => {
    expect(() => validateDataAppPath(path)).toThrow(
      "A valid data app path must be provided.",
    );
  });
});

import { getCrossOriginDataAppHref } from "./get-cross-origin-data-app-href";

describe("getCrossOriginDataAppHref", () => {
  it("returns an absolute site-url URL in cross-origin mode", () => {
    expect(
      getCrossOriginDataAppHref(
        "sales",
        "https://apps.example.com",
        "https://mb.example.com",
      ),
    ).toBe("https://mb.example.com/apps/sales");
  });

  it("encodes the app name", () => {
    expect(
      getCrossOriginDataAppHref(
        "sales report",
        "https://apps.example.com",
        "https://mb.example.com",
      ),
    ).toBe("https://mb.example.com/apps/sales%20report");
  });

  it("returns null in same-origin mode (no apps host)", () => {
    expect(
      getCrossOriginDataAppHref("sales", null, "https://mb.example.com"),
    ).toBeNull();
  });

  it("returns null when site-url is missing", () => {
    expect(
      getCrossOriginDataAppHref("sales", "https://apps.example.com", null),
    ).toBeNull();
  });

  it("returns null when site-url is unparseable", () => {
    expect(
      getCrossOriginDataAppHref(
        "sales",
        "https://apps.example.com",
        "nonsense",
      ),
    ).toBeNull();
  });
});

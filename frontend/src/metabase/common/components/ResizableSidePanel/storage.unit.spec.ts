import { getStoredSidePanelWidth, setStoredSidePanelWidth } from "./storage";

const STORAGE_KEY = "metabase-side-panel-widths";

describe("side panel width storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns undefined when no width has been stored", () => {
    expect(getStoredSidePanelWidth("main-nav")).toBeUndefined();
  });

  it("stores widths independently per panel", () => {
    setStoredSidePanelWidth("main-nav", 300);
    setStoredSidePanelWidth("admin-nav", 360);

    expect(getStoredSidePanelWidth("main-nav")).toBe(300);
    expect(getStoredSidePanelWidth("admin-nav")).toBe(360);
  });

  it("forgets a width without affecting other panels", () => {
    setStoredSidePanelWidth("main-nav", 300);
    setStoredSidePanelWidth("admin-nav", 360);

    setStoredSidePanelWidth("main-nav", undefined);

    expect(getStoredSidePanelWidth("main-nav")).toBeUndefined();
    expect(getStoredSidePanelWidth("admin-nav")).toBe(360);
  });

  it("removes the localStorage entry once no widths remain", () => {
    setStoredSidePanelWidth("main-nav", 300);
    setStoredSidePanelWidth("main-nav", undefined);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("ignores malformed stored data", () => {
    localStorage.setItem(STORAGE_KEY, "not json");

    expect(getStoredSidePanelWidth("main-nav")).toBeUndefined();
  });

  it("ignores stored values that aren't finite numbers", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "main-nav": "300", "admin-nav": null, "data-nav": 280 }),
    );

    expect(getStoredSidePanelWidth("main-nav")).toBeUndefined();
    expect(getStoredSidePanelWidth("admin-nav")).toBeUndefined();
    expect(getStoredSidePanelWidth("data-nav")).toBe(280);
  });
});

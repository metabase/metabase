import { deriveSdkThemeSettings } from "./derive-sdk-theme-settings";

describe("deriveSdkThemeSettings", () => {
  it("produces SDK-shaped colors for the light variant", () => {
    const theme = deriveSdkThemeSettings("light");

    expect(theme.colors).toBeDefined();
    expect(typeof theme.colors?.brand).toBe("string");
    expect(typeof theme.colors?.background).toBe("string");
    expect(typeof theme.colors?.["text-primary"]).toBe("string");
    expect(theme.colors?.charts).toHaveLength(8);
  });

  it("produces a different background for the dark variant than the light variant", () => {
    const light = deriveSdkThemeSettings("light");
    const dark = deriveSdkThemeSettings("dark");

    expect(dark.colors?.background).toBeDefined();
    expect(dark.colors?.background).not.toBe(light.colors?.background);
    expect(dark.colors?.["text-primary"]).not.toBe(
      light.colors?.["text-primary"],
    );
  });

  it("applies whitelabel overrides on top of the base variant", () => {
    const theme = deriveSdkThemeSettings("light", {
      brand: "#8e44ad",
      filter: "#16a085",
      summarize: "#d35400",
    });

    expect(theme.colors?.brand).toBe("#8e44ad");
    expect(theme.colors?.filter).toBe("#16a085");
    expect(theme.colors?.summarize).toBe("#d35400");
  });

  it("applies whitelabel accent colors to the chart palette", () => {
    const theme = deriveSdkThemeSettings("light", {
      accent0: "#e74c3c",
      accent7: "#34495e",
    });

    expect(theme.colors?.charts?.[0]).toBe("#e74c3c");
    expect(theme.colors?.charts?.[7]).toBe("#34495e");
  });

  it("retains whitelabel overrides on the dark variant", () => {
    const dark = deriveSdkThemeSettings("dark", { brand: "#ff003b" });

    expect(dark.colors?.brand).toBe("#ff003b");
  });
});

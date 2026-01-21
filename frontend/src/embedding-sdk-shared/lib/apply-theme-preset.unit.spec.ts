import { applyThemePreset } from "./apply-theme-preset";

const PRESET_COLOR_KEYS = [
  "background",
  "background-disabled",
  "background-secondary",
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "border",
  "brand-hover",
  "brand-hover-light",
] as const;

describe("applyThemePreset", () => {
  describe.each(["light", "dark"] as const)("%s preset", (preset) => {
    it("applies preset colors as base", () => {
      const result = applyThemePreset({ preset });

      PRESET_COLOR_KEYS.forEach((key) => {
        expect(result?.colors?.[key]).toBeDefined();
      });
    });

    it("allows user colors to override preset colors", () => {
      const theme = {
        preset,
        colors: {
          background: "#custom-bg",
          brand: "#custom-brand",
        },
      };

      const result = applyThemePreset(theme);

      expect(result?.colors?.background).toBe("#custom-bg");
      expect(result?.colors?.brand).toBe("#custom-brand");
      expect(result?.colors?.["text-primary"]).toBeDefined();
    });

    it("preserves other theme properties", () => {
      const theme = {
        preset,
        fontSize: "18px",
        fontFamily: "Custom Font",
      };

      const result = applyThemePreset(theme);

      expect(result?.fontSize).toBe("18px");
      expect(result?.fontFamily).toBe("Custom Font");
      expect(result?.preset).toBe(preset);
    });
  });

  describe("no preset", () => {
    it("returns undefined for undefined theme", () => {
      expect(applyThemePreset(undefined)).toBeUndefined();
    });

    it("returns theme unchanged when no preset specified", () => {
      const theme = { colors: { brand: "#000" } };

      expect(applyThemePreset(theme)).toEqual(theme);
    });
  });

  describe("invalid preset", () => {
    it("returns empty colors for unknown preset", () => {
      const theme = {
        preset: "invalid-preset" as any,
        colors: { brand: "#custom" },
      };

      const result = applyThemePreset(theme);

      expect(result?.colors).toEqual({ brand: "#custom" });
    });
  });
});

import { applyThemePreset } from "./apply-theme-preset";

const EXPECTED_DARK_COLORS = {
  background: "#1b1919",
  "text-primary": "#f5f6f7",
  "background-hover": "rgb(41, 38, 38)",
  "background-disabled": "rgb(32, 30, 30)",
  "background-secondary": "rgb(22, 20, 20)",
  "background-light": "rgb(43, 40, 40)",
  "text-secondary": "rgb(163, 172, 181)",
  "text-tertiary": "rgb(88, 98, 109)",
  border: "rgba(220, 223, 224, 0.7)",
  "brand-hover": "rgba(80, 158, 226, 0.5)",
  "brand-hover-light": "rgba(80, 158, 226, 0.3)",
};

describe("applyThemePreset", () => {
  describe("light preset", () => {
    it("returns theme unchanged", () => {
      const theme = {
        preset: "light" as const,
        colors: { brand: "#ff0000" },
        fontSize: "16px",
      };

      expect(applyThemePreset(theme)).toEqual(theme);
    });
  });

  describe("dark preset", () => {
    it("applies dark preset colors as base", () => {
      const result = applyThemePreset({ preset: "dark" });

      expect(result?.colors).toEqual(EXPECTED_DARK_COLORS);
    });

    it("allows user colors to override dark preset colors", () => {
      const theme = {
        preset: "dark" as const,
        colors: {
          background: "#custom-bg",
          brand: "#custom-brand",
        },
      };

      const result = applyThemePreset(theme);

      expect(result?.colors).toEqual({
        ...EXPECTED_DARK_COLORS,
        background: "#custom-bg",
        brand: "#custom-brand",
      });
    });

    it("preserves other theme properties", () => {
      const theme = {
        preset: "dark" as const,
        fontSize: "18px",
        fontFamily: "Custom Font",
      };

      const result = applyThemePreset(theme);

      expect(result?.fontSize).toBe("18px");
      expect(result?.fontFamily).toBe("Custom Font");
      expect(result?.preset).toBe("dark");
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
});

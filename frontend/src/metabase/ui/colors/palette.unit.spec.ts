import Color from "color";

import { colors } from "./colors";
import { color, getTextColorForBackground } from "./palette";
import type { ColorGetter } from "./types";

describe("palette", () => {
  it("should get a color from the palette", () => {
    expect(color("core-brand")).toBeDefined();
  });

  it("should set a color in the palette", () => {
    const originalColor = color("core-brand");
    colors["core-brand"] = "blue";
    const modifiedColor = color("core-brand");
    colors["core-brand"] = originalColor;

    expect(modifiedColor).toEqual("blue");
  });

  it("should get a computed color", () => {
    expect(color("accent1-light")).toBeDefined();
  });
});

describe("getTextColorForBackground", () => {
  const DARK_FILL = "#8254ab";
  const LIGHT_FILL = "#ffffcc";

  const isLight = (c: string) => Color(c).luminosity() > 0.5;

  // `text-primary` and `text-primary-inverse` swap meanings between the light and dark themes
  const lightThemeGetColor: ColorGetter = (name) =>
    ({ "text-primary": "#1a1a1a", "text-primary-inverse": "#ffffff" })[name] ??
    name;
  const darkThemeGetColor: ColorGetter = (name) =>
    ({ "text-primary": "#ffffff", "text-primary-inverse": "#1a1a1a" })[name] ??
    name;

  it("returns light text on a dark fill and dark text on a light fill", () => {
    expect(isLight(getTextColorForBackground(DARK_FILL))).toBe(true);
    expect(isLight(getTextColorForBackground(LIGHT_FILL))).toBe(false);
  });

  it("returns the same text color regardless of the theme getColor", () => {
    expect(getTextColorForBackground(DARK_FILL, darkThemeGetColor)).toEqual(
      getTextColorForBackground(DARK_FILL, lightThemeGetColor),
    );
    expect(getTextColorForBackground(LIGHT_FILL, darkThemeGetColor)).toEqual(
      getTextColorForBackground(LIGHT_FILL, lightThemeGetColor),
    );
  });
});

import Color from "color";

import type { ColorGetter } from "metabase/visualizations/types";

import { colors } from "./colors";
import type { ColorPalette } from "./types";

export const ACCENT_COUNT = 8;

export const originalColors = { ...colors };

export const aliases: Record<string, (palette: ColorPalette) => string> = {
  dashboard: (palette) => color("brand", palette),
  nav: (palette) => color("bg-white", palette),
  content: (palette) => color("bg-light", palette),
  database: (palette) => color("accent2", palette),
  pulse: (palette) => color("accent4", palette),
  "text-primary": (palette) => color("text-dark", palette),
  "text-secondary": (palette) => color("text-medium", palette),
  "text-tertiary": (palette) => color("text-light", palette),
  background: (palette) => color("white", palette),
  "background-disbaled": (palette) => color("accent-gray", palette),
  "brand-light": (palette) => lighten(color("brand", palette), 0.532), // #DDECFA
  "brand-lighter": (palette) => lighten(color("brand", palette), 0.598), // #EEF6FC for brand
  focus: (palette) => getFocusColor("brand", palette),

  "accent0-light": (palette) => tint(color(`accent0`, palette)),
  "accent1-light": (palette) => tint(color(`accent1`, palette)),
  "accent2-light": (palette) => tint(color(`accent2`, palette)),
  "accent3-light": (palette) => tint(color(`accent3`, palette)),
  "accent4-light": (palette) => tint(color(`accent4`, palette)),
  "accent5-light": (palette) => tint(color(`accent5`, palette)),
  "accent6-light": (palette) => tint(color(`accent6`, palette)),
  "accent7-light": (palette) => tint(color(`accent7`, palette)),

  "accent0-dark": (palette) => shade(color(`accent0`, palette)),
  "accent1-dark": (palette) => shade(color(`accent1`, palette)),
  "accent2-dark": (palette) => shade(color(`accent2`, palette)),
  "accent3-dark": (palette) => shade(color(`accent3`, palette)),
  "accent4-dark": (palette) => shade(color(`accent4`, palette)),
  "accent5-dark": (palette) => shade(color(`accent5`, palette)),
  "accent6-dark": (palette) => shade(color(`accent6`, palette)),
  "accent7-dark": (palette) => shade(color(`accent7`, palette)),
};

/**
 * @deprecated use CSS variables instead where possible,
 * i.e. `var(--mb-color-text-light)`.
 *
 * When the hex values are needed, use the themeColor function
 * from Mantine's theme, i.e. `theme.fn.themeColor("text-light")`
 */
export function color(
  colorName: keyof ColorPalette,
  palette?: ColorPalette,
): string;
export function color(color: string, palette?: ColorPalette): string;
export function color(color: any, palette: ColorPalette = colors) {
  const fullPalette = {
    ...colors,
    ...palette,
  };

  if (color in fullPalette) {
    return fullPalette[color as keyof ColorPalette];
  }

  if (color in aliases) {
    return aliases[color](palette);
  }

  return color;
}

/**
 * @deprecated use the color-mix method with CSS variables instead
 * where possible, i.e. `color-mix(in srgb, var(--mb-color-bg-light), transparent 10%)`
 *
 * When the hex values are needed, use the themeColor function
 * from Mantine's theme, i.e. `alpha(theme.fn.themeColor("text-light"), 0.1)`
 */
export const alpha = (c: string, a: number) => {
  return Color(color(c)).alpha(a).string();
};

/**
 * @deprecated use the color-mix method with CSS variables instead
 * where possible, i.e. `color-mix(in srgb, var(--mb-color-text-light), white 10%)`
 *
 * When the hex values are needed, use the themeColor function
 * from Mantine's theme, i.e. `lighten(theme.fn.themeColor("text-light"), 0.1)`
 */
export const lighten = (c: string, f: number = 0.5) => {
  return Color(color(c)).lighten(f).string();
};

/**
 * @deprecated use the color-mix method with CSS variables instead
 * where possible, i.e. `color-mix(in srgb, var(--mb-color-text-light), black 10%)`
 *
 * When the hex values are needed, use the themeColor function
 * from Mantine's theme, i.e. `darken(theme.fn.themeColor("text-light"), 0.1)`
 */
export const darken = (c: string, f: number = 0.25) => {
  return Color(color(c)).darken(f).string();
};

export const tint = (c: string, f: number = 0.125) => {
  const value = Color(color(c));
  return value.lightness(value.lightness() + f * 100).hex();
};

export const shade = (c: string, f: number = 0.125) => {
  const value = Color(color(c));
  return value.lightness(value.lightness() - f * 100).hex();
};

export const hueRotate = (c: string) => {
  return Color(color(c)).hue() - Color(color(c, originalColors)).hue();
};

export const isLight = (c: string) => {
  return Color(color(c)).isLight();
};

export const isDark = (c: string) => {
  return Color(color(c)).isDark();
};

/**
 * Lighten or darken the color, based on whether it's dark or light.
 * Can be used for deriving hover or highlight colors.
 **/
export const adjustBrightness = (
  c: string,
  lightenBy?: number,
  darkenBy?: number,
) => {
  return isDark(c) ? lighten(c, lightenBy) : darken(c, darkenBy);
};

export const getFocusColor = (
  colorName: string,
  palette: ColorPalette = colors,
) => lighten(color(colorName, palette), 0.465); // #cbe2f7

// We intentionally want to return white text color more frequently
// https://www.notion.so/Maz-notes-on-viz-settings-67aed0e4ddcc4d4a83028992c4301820?d=513f4f7fa9c143cb874c7e4525dfb1e9#277d6b3eeb464eac86088abd144fde9e
const whiteTextColorPriorityFactor = 3;

export const getTextColorForBackground = (
  backgroundColor: string,
  getColor: ColorGetter = color,
) => {
  const whiteTextContrast =
    Color(getColor(backgroundColor)).contrast(Color(getColor("text-white"))) *
    whiteTextColorPriorityFactor;
  const darkTextContrast = Color(getColor(backgroundColor)).contrast(
    Color(getColor("text-dark")),
  );

  return whiteTextContrast > darkTextContrast
    ? getColor("text-white")
    : getColor("text-dark");
};

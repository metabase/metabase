import Color from "color";

import type { ColorGetter } from "metabase/visualizations/types";

import type { ColorPalette } from "./types";

export const ACCENT_COUNT = 8;

// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW
// NOTE: KEEP SYNCRONIZED WITH:
// frontend/src/metabase/css/core/colors.module.css
// frontend/src/metabase/styled-components/containers/GlobalStyles/GlobalStyles.tsx
// frontend/src/metabase/styled-components/theme/css-variables.ts

const brandBaseColor = "hsla(208, 72%, 60%, 1)"; // ocean 40

const baseColors = {
  white: "hsla(255, 0%, 100%,1)",
  black: "hsla(255, 0%, 0%, 1)",

  /* Brand */
  "brand-100": Color(brandBaseColor).darken(0.7),
  "brand-90": Color(brandBaseColor).darken(0.6),
  "brand-80": Color(brandBaseColor).darken(0.5),
  "brand-70": Color(brandBaseColor).darken(0.4),
  "brand-60": Color(brandBaseColor).darken(0.3),
  "brand-50": Color(brandBaseColor).darken(0.2),
  "brand-40": brandBaseColor,
  "brand-30": Color(brandBaseColor).lighten(0.2),
  "brand-20": Color(brandBaseColor).lighten(0.3),
  "brand-10": Color(brandBaseColor).lighten(0.4),
  "brand-5": Color(brandBaseColor).lighten(0.5),

  /* Orion */
  "orion-100": "hsla(204, 66%, 8%, 1)",
  "orion-90": "hsla(204, 34%, 14%, 1)",
  "orion-80": "hsla(205, 19%, 23%, 1)",
  "orion-70": "hsla(204, 12%, 32%, 1)",
  "orion-60": "hsla(205, 8%, 43%, 1)",
  "orion-50": "hsla(203, 5%, 53%, 1)",
  "orion-40": "hsla(205, 6%, 60%, 1)",
  "orion-30": "hsla(203, 6%, 73%, 1)",
  "orion-20": "hsla(195, 6%, 87%, 1)",
  "orion-10": "hsla(240, 4%, 95%, 1)",
  "orion-5": "hsla(240, 11%, 98%, 1)",

  /* Orion Alpha */
  "orion-alpha-100": "hsla(205, 68%, 8%, 1)",
  "orion-alpha-90": "hsla(204, 66%, 8%, 0.93)",
  "orion-alpha-80": "hsla(204, 66%, 8%, 0.84)",
  "orion-alpha-70": "hsla(204, 66%, 8%, 0.74)",
  "orion-alpha-60": "hsla(204, 66%, 8%, 0.62)",
  "orion-alpha-50": "hsla(204, 66%, 8%, 0.51)",
  "orion-alpha-40": "hsla(204, 66%, 8%, 0.44)",
  "orion-alpha-30": "hsla(204, 66%, 8%, 0.29)",
  "orion-alpha-20": "hsla(204, 66%, 8%, 0.14)",
  "orion-alpha-10": "hsla(204, 66%, 8%, 0.05)",
  "orion-alpha-5": "hsla(204, 66%, 8%, 0.02)",

  /* Ocean */
  "ocean-100": "hsla(208, 100%, 9%, 1)",
  "ocean-90": "hsla(208, 89%, 15%, 1)",
  "ocean-80": "hsla(208, 82%, 22%, 1)",
  "ocean-70": "hsla(208, 80%, 31%, 1)",
  "ocean-60": "hsla(208, 78%, 42%, 1)",
  "ocean-50": "hsla(208, 68%, 53%, 1)",
  "ocean-40": "hsla(208, 72%, 60%, 1)",
  "ocean-30": "hsla(208, 73%, 74%, 1)",
  "ocean-20": "hsla(209, 73%, 88%, 1)",
  "ocean-10": "hsla(208, 79%, 96%, 1)",
  "ocean-5": "hsla(208, 75%, 98%, 1)",

  /* Lobster */
  "lobster-100": "hsla(0, 81%, 11%, 1)",
  "lobster-90": "hsla(1, 75%, 17%, 1)",
  "lobster-80": "hsla(1, 71%, 26%, 1)",
  "lobster-70": "hsla(1, 69%, 37%, 1)",
  "lobster-60": "hsla(1, 67%, 49%, 1)",
  "lobster-50": "hsla(358, 71%, 62%, 1)",
  "lobster-40": "hsla(1, 84%, 69%, 1)",
  "lobster-30": "hsla(1, 85%, 81%, 1)",
  "lobster-20": "hsla(2, 67%, 90%, 1)",
  "lobster-10": "hsla(0, 76%, 97%, 1)",
  "lobster-5": "hsla(0, 100%, 99%, 1)",

  /* Flamingo */
  "flamingo-100": "hsla(334, 75%, 10%, 1)",
  "flamingo-90": "hsla(334, 79%, 17%, 1)",
  "flamingo-80": "hsla(334, 72%, 26%, 1)",
  "flamingo-70": "hsla(334, 71%, 36%, 1)",
  "flamingo-60": "hsla(334, 69%, 48%, 1)",
  "flamingo-50": "hsla(334, 67%, 60%, 1)",
  "flamingo-40": "hsla(334, 80%, 68%, 1)",
  "flamingo-30": "hsla(334, 79%, 80%, 1)",
  "flamingo-20": "hsla(335, 79%, 91%, 1)",
  "flamingo-10": "hsla(335, 67%, 96%, 1)",
  "flamingo-5": "hsla(330, 67%, 99%, 1)",

  /* Mango */
  "mango-100": "hsla(26, 89%, 7%, 1)",
  "mango-90": "hsla(26, 79%, 13%, 1)",
  "mango-80": "hsla(25, 73%, 20%, 1)",
  "mango-70": "hsla(26, 70%, 29%, 1)",
  "mango-60": "hsla(26, 69%, 39%, 1)",
  "mango-50": "hsla(26, 68%, 48%, 1)",
  "mango-40": "hsla(26, 79%, 54%, 1)",
  "mango-30": "hsla(26, 84%, 70%, 1)",
  "mango-20": "hsla(26, 88%, 87%, 1)",
  "mango-10": "hsla(25, 100%, 95%, 1)",
  "mango-5": "hsla(30, 100%, 98%, 1)",

  /* Dubloon */
  "dubloon-100": "hsla(30, 100%, 98%, 1)",
  "dubloon-90": "hsla(46, 88%, 10%, 1)",
  "dubloon-80": "hsla(46, 82%, 15%, 1)",
  "dubloon-70": "hsla(46, 79%, 22%, 1)",
  "dubloon-60": "hsla(46, 76%, 30%, 1)",
  "dubloon-50": "hsla(46, 76%, 37%, 1)",
  "dubloon-40": "hsla(46, 75%, 44%, 1)",
  "dubloon-30": "hsla(46, 81%, 52%, 1)",
  "dubloon-20": "hsla(46, 94%, 74%, 1)",
  "dubloon-10": "hsla(46, 96%, 90%, 1)",
  "dubloon-5": "hsla(46, 96%, 90%, 1)",

  /* Palm */
  "palm-100": "hsla(94, 85%, 5%, 1)",
  "palm-90": "hsla(92, 62%, 10%, 1)",
  "palm-80": "hsla(89, 54%, 16%, 1)",
  "palm-70": "hsla(89, 50%, 24%, 1)",
  "palm-60": "hsla(89, 48%, 32%, 1)",
  "palm-50": "hsla(89, 48%, 40%, 1)",
  "palm-40": "hsla(89, 47%, 45%, 1)",
  "palm-30": "hsla(90, 47%, 60%, 1)",
  "palm-20": "hsla(91, 51%, 81%, 1)",
  "palm-10": "hsla(92, 65%, 92%, 1)",
  "palm-5": "hsla(93, 73%, 97%, 1)",

  /* Seafoam */
  "seafoam-100": "hsla(180, 84%, 5%, 1)",
  "seafoam-90": "hsla(180, 34%, 12%, 1)",
  "seafoam-80": "hsla(180, 80%, 14%, 1)",
  "seafoam-70": "hsla(180, 70%, 21%, 1)",
  "seafoam-60": "hsla(180, 44%, 33%, 1)",
  "seafoam-50": "hsla(180, 74%, 34%, 1)",
  "seafoam-40": "hsla(180, 42%, 46%, 1)",
  "seafoam-30": "hsla(180, 47%, 60%, 1)",
  "seafoam-20": "hsla(180, 55%, 81%, 1)",
  "seafoam-10": "hsla(180, 68%, 93%, 1)",
  "seafoam-5": "hsla(180, 69%, 97%, 1)",

  /* Octopus */
  "octopus-100": "hsla(240, 7%, 9%, 1)",
  "octopus-90": "hsla(240, 7%, 9%, 1)",
  "octopus-80": "hsla(240, 43%, 33%, 1)",
  "octopus-70": "hsla(240, 40%, 46%, 1)",
  "octopus-60": "hsla(240, 46%, 58%, 1)",
  "octopus-50": "hsla(240, 65%, 69%, 1)",
  "octopus-40": "hsla(240, 69%, 74%, 1)",
  "octopus-30": "hsla(240, 49%, 81%, 1)",
  "octopus-20": "hsla(240, 66%, 92%, 1)",
  "octopus-10": "hsla(240, 100%, 97%, 1)",
  "octopus-5": "hsla(240, 100%, 99%, 1)",
};

export const semanticColors = {
  brand: baseColors["brand-40"],
  "brand-light": baseColors["brand-30"],
  "brand-lighter": baseColors["brand-20"],
  "brand-alpha-04": Color(baseColors["brand-40"]).alpha(0.04),
  "brand-alpha-30": Color(baseColors["brand-40"]).alpha(0.3),
  "brand-alpha-88": Color(baseColors["brand-40"]).alpha(0.88),

  filter: baseColors["octopus-70"],
  summarize: baseColors["palm-50"],
  success: baseColors["palm-50"],
  error: baseColors["lobster-60"],
  danger: baseColors["lobster-60"],
  warning: baseColors["dubloon-30"],

  white: baseColors.white,

  accent0: "#509EE3",
  accent1: "#88BF4D",
  accent2: "#A989C5",
  accent3: "#EF8C8C",
  accent4: "#F9D45C",
  accent5: "#F2A86F",
  accent6: "#98D9D9",
  accent7: "#7172AD",

  "accent-gray": baseColors["orion-10"],
  "accent-gray-light": baseColors["orion-5"],
  "accent-gray-dark": baseColors["orion-20"],

  "text-dark": baseColors["orion-80"],
  "text-medium": baseColors["orion-alpha-60"],
  "text-light": baseColors["orion-alpha-40"],
  "text-white": baseColors.white,
  "text-white-alpha-85": Color(baseColors.white).alpha(0.85),
  "text-secondary": baseColors["orion-alpha-60"],
  "text-tertiary": baseColors["orion-alpha-40"],
  "text-selected": baseColors.white,
  "text-hover": baseColors["brand-40"],
  "text-disabled": baseColors["orion-alpha-40"],
  "text-brand": baseColors["brand-40"],

  background: baseColors.white,
  "background-info": baseColors["orion-5"],
  "background-selected": baseColors["brand-40"],
  "background-hover": baseColors["ocean-10"],
  "background-disabled": baseColors["orion-10"],
  "background-inverse": baseColors.black,
  "background-brand": baseColors["brand-40"],

  "icon-primary": baseColors["brand-40"],
  "icon-primary-disabled": baseColors["orion-30"],
  "icon-secondary": baseColors["brand-20"],
  "icon-secondary-disabled": baseColors["orion-10"],

  "tooltip-text": baseColors.white,
  "tooltip-text-secondary": baseColors["orion-alpha-40"],
  "tooltip-background": baseColors["orion-100"],
  "tooltip-background-focused": baseColors["orion-100"],

  "bg-black": baseColors["orion-100"],
  "bg-medium": baseColors["orion-10"],
  "bg-light": baseColors["orion-5"],
  "bg-night": baseColors["orion-80"],
  "bg-dark": baseColors["orion-alpha-5"],
  "bg-white": baseColors.white,
  "bg-black-alpha-60": Color(baseColors["orion-100"]).alpha(0.6),
  "bg-white-alpha-15": Color(baseColors.white).alpha(0.15),

  "bg-yellow": "#FFFCF2",
  "bg-error": "#ED6E6E55",

  shadow: baseColors["orion-alpha-20"],
  border: baseColors["orion-alpha-20"],
  "border-alpha-30": "",

  /* Saturated colors for the SQL editor. Shouldn't be used elsewhere since they're not white-labelable. */
  "saturated-blue": "#2D86D4",
  "saturated-green": "#70A63A",
  "saturated-purple": "#885AB1",
  "saturated-red": "#ED6E6E",
  "saturated-yellow": "#F9CF48",

  "admin-navbar": "#7172AD",
};

export const colors = {
  ...semanticColors,
};

/* eslint-enable no-color-literals */

export const originalColors = { ...colors };

export const aliases: Record<string, (palette: ColorPalette) => string> = {
  dashboard: palette => color("brand", palette),
  nav: palette => color("bg-white", palette),
  content: palette => color("bg-light", palette),
  database: palette => color("accent2", palette),
  pulse: palette => color("accent4", palette),

  "brand-light": palette => lighten(color("brand", palette), 0.532), // #DDECFA
  "brand-lighter": palette => lighten(color("brand", palette), 0.598), // #EEF6FC for brand
  focus: palette => getFocusColor("brand", palette),

  "accent0-light": palette => tint(color(`accent0`, palette)),
  "accent1-light": palette => tint(color(`accent1`, palette)),
  "accent2-light": palette => tint(color(`accent2`, palette)),
  "accent3-light": palette => tint(color(`accent3`, palette)),
  "accent4-light": palette => tint(color(`accent4`, palette)),
  "accent5-light": palette => tint(color(`accent5`, palette)),
  "accent6-light": palette => tint(color(`accent6`, palette)),
  "accent7-light": palette => tint(color(`accent7`, palette)),

  "accent0-dark": palette => shade(color(`accent0`, palette)),
  "accent1-dark": palette => shade(color(`accent1`, palette)),
  "accent2-dark": palette => shade(color(`accent2`, palette)),
  "accent3-dark": palette => shade(color(`accent3`, palette)),
  "accent4-dark": palette => shade(color(`accent4`, palette)),
  "accent5-dark": palette => shade(color(`accent5`, palette)),
  "accent6-dark": palette => shade(color(`accent6`, palette)),
  "accent7-dark": palette => shade(color(`accent7`, palette)),
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

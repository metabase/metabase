import Color from "color";
import { ColorPalette } from "./types";

export const ACCENT_COUNT = 8;

// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW
// NOTE: KEEP SYNCRONIZED WITH COLORS.CSS
/* eslint-disable no-color-literals */
const colors: ColorPalette = {
  brand: "#509EE3",
  "brand-light": "#DDECFA",
  accent0: "#509EE3",
  accent1: "#88BF4D",
  accent2: "#A989C5",
  accent3: "#EF8C8C",
  accent4: "#F9D45C",
  accent5: "#F2A86F",
  accent6: "#98D9D9",
  accent7: "#7172AD",
  "admin-navbar": "#7172AD",
  white: "#FFFFFF",
  black: "#2E353B",
  success: "#84BB4C",
  danger: "#ED6E6E",
  error: "#ED6E6E",
  warning: "#F9CF48",
  "text-dark": "#4C5773",
  "text-medium": "#949AAB",
  "text-light": "#B8BBC3",
  "text-white": "#FFFFFF",
  "bg-black": "#2E353B",
  "bg-dark": "#93A1AB",
  "bg-medium": "#EDF2F5",
  "bg-light": "#F9FBFC",
  "bg-white": "#FFFFFF",
  "bg-yellow": "#FFFCF2",
  focus: "#CBE2F7",
  shadow: "rgba(0,0,0,0.08)",
  border: "#EEECEC",

  /* Saturated colors for the SQL editor. Shouldn't be used elsewhere since they're not white-labelable. */
  "saturated-blue": "#2D86D4",
  "saturated-green": "#70A63A",
  "saturated-purple": "#885AB1",
  "saturated-red": "#ED6E6E",
  "saturated-yellow": "#F9CF48",
};
/* eslint-enable no-color-literals */

const aliases: Record<string, (palette: ColorPalette) => string> = {
  dashboard: palette => color("brand", palette),
  nav: palette => color("bg-white", palette),
  content: palette => color("bg-light", palette),
  summarize: palette => color("accent1", palette),
  database: palette => color("accent2", palette),
  pulse: palette => color("accent4", palette),
  filter: palette => color("accent7", palette),

  "brand-light": palette => lighten(color("brand", palette), 0.532),
  focus: palette => lighten(color("brand", palette), 0.7),

  "accent0-light": palette => lighten(color(`accent0`, palette), 0.3),
  "accent1-light": palette => lighten(color(`accent1`, palette), 0.3),
  "accent2-light": palette => lighten(color(`accent2`, palette), 0.3),
  "accent3-light": palette => lighten(color(`accent3`, palette), 0.3),
  "accent4-light": palette => lighten(color(`accent4`, palette), 0.3),
  "accent5-light": palette => lighten(color(`accent5`, palette), 0.3),
  "accent6-light": palette => lighten(color(`accent6`, palette), 0.3),
  "accent7-light": palette => lighten(color(`accent7`, palette), 0.3),

  "accent0-dark": palette => darken(color(`accent0`, palette), 0.3),
  "accent1-dark": palette => darken(color(`accent1`, palette), 0.3),
  "accent2-dark": palette => darken(color(`accent2`, palette), 0.3),
  "accent3-dark": palette => darken(color(`accent3`, palette), 0.3),
  "accent4-dark": palette => darken(color(`accent4`, palette), 0.3),
  "accent5-dark": palette => darken(color(`accent5`, palette), 0.3),
  "accent6-dark": palette => darken(color(`accent6`, palette), 0.3),
  "accent7-dark": palette => darken(color(`accent7`, palette), 0.3),
};

export function color(color: string, palette = colors) {
  if (color in palette) {
    return palette[color];
  }

  if (color in aliases) {
    return aliases[color](palette);
  }

  return color;
}

export const alpha = (c: string, a: number) => {
  return Color(color(c))
    .alpha(a)
    .string(0);
};

export const lighten = (c: string, f: number = 0.5) => {
  return Color(color(c))
    .lighten(f)
    .string(0);
};

export const darken = (c: string, f: number = 0.25) => {
  return Color(color(c))
    .darken(f)
    .string(0);
};

export const getColors = () => {
  return colors;
};

export const setColor = (key: string, value: string) => {
  colors[key] = value;
};

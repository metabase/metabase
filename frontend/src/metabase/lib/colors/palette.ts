import Color from "color";
import { ColorFamily } from "./types";

// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW
// NOTE: KEEP SYNCRONIZED WITH COLORS.CSS
/* eslint-disable no-color-literals */
export const colors: Record<string, string> = {
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

export const aliases: Record<string, (family: ColorFamily) => string> = {
  dashboard: family => color("brand", family),
  nav: family => color("bg-white", family),
  content: family => color("bg-light", family),
  summarize: family => color("accent1", family),
  database: family => color("accent2", family),
  pulse: family => color("accent4", family),
  filter: family => color("accent7", family),

  "brand-light": family => lighten(color("brand", family), 0.532),
  focus: family => lighten(color("brand", family), 0.7),

  "accent0-light": family => lighten(color(`accent0`, family), 0.3),
  "accent1-light": family => lighten(color(`accent1`, family), 0.3),
  "accent2-light": family => lighten(color(`accent2`, family), 0.3),
  "accent3-light": family => lighten(color(`accent3`, family), 0.3),
  "accent4-light": family => lighten(color(`accent4`, family), 0.3),
  "accent5-light": family => lighten(color(`accent5`, family), 0.3),
  "accent6-light": family => lighten(color(`accent6`, family), 0.3),
  "accent7-light": family => lighten(color(`accent7`, family), 0.3),

  "accent0-dark": family => darken(color(`accent0`, family), 0.3),
  "accent1-dark": family => darken(color(`accent1`, family), 0.3),
  "accent2-dark": family => darken(color(`accent2`, family), 0.3),
  "accent3-dark": family => darken(color(`accent3`, family), 0.3),
  "accent4-dark": family => darken(color(`accent4`, family), 0.3),
  "accent5-dark": family => darken(color(`accent5`, family), 0.3),
  "accent6-dark": family => darken(color(`accent6`, family), 0.3),
  "accent7-dark": family => darken(color(`accent7`, family), 0.3),
};

export function color(color: string, family = colors) {
  if (color in family) {
    return family[color];
  }

  if (color in aliases) {
    return aliases[color](family);
  }

  return color;
}

export const alpha = (c: string, a: number) => {
  return Color(color(c))
    .alpha(a)
    .string();
};

export const lighten = (c: string, f: number = 0.5) => {
  return Color(color(c))
    .lighten(f)
    .string();
};

export const darken = (c: string, f: number = 0.25) => {
  return Color(color(c))
    .darken(f)
    .string();
};

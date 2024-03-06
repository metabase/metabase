import type { Theme } from "@emotion/react";
import type { MantineTheme } from "@mantine/core";
import * as colors from "metabase/lib/colors";
import type { ColorPalette } from "metabase/lib/colors/types";

type ColorShades = MantineTheme["colors"]["dark"];

const ORIGINAL_COLORS = [
  "dark",
  "gray",
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "blue",
  "cyan",
  "green",
  "lime",
  "yellow",
  "orange",
  "teal",
];

const CUSTOM_COLORS = [
  "brand",
  "brand-lighter",
  "text-white",
  "text-light",
  "text-medium",
  "text-dark",
  "focus",
  "border",
  "bg-light",
  "bg-medium",
  "bg-dark",
  "bg-black",
  "success",
  "error",
  "white",
];

function getColorShades(color: string): ColorShades {
  return Array(10).fill(color) as ColorShades;
}

export function getThemeColors(): Record<string, ColorShades> {
  return {
    ...Object.fromEntries(
      ORIGINAL_COLORS.map(name => [name, getColorShades("transparent")]),
    ),
    ...Object.fromEntries(
      CUSTOM_COLORS.map(name => [name, getColorShades(colors.color(name))]),
    ),
  };
}

type ThemeColorFunction = ({ theme }: { theme: Theme }) => string;

export function color(colorName: keyof ColorPalette): ThemeColorFunction;
export function color(color: string): ThemeColorFunction;
export function color(color: any): ThemeColorFunction {
  return ({ theme }) => theme.fn.themeColor(color);
}

export function alpha(
  colorName: keyof ColorPalette,
  alphaValue: number,
): ThemeColorFunction;
export function alpha(color: string, alphaValue: number): ThemeColorFunction;
export function alpha(color: any, alphaValue: number): ThemeColorFunction {
  return ({ theme }) => colors.alpha(theme.fn.themeColor(color), alphaValue);
}

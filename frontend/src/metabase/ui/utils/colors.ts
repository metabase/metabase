import type { MantineTheme } from "@mantine/core";

import {
  DEFAULT_CHART_COLORS,
  deriveColorPalette,
} from "metabase/lib/colors/derived-colors";
import type { ColorName, MetabaseThemeV2 } from "metabase/lib/colors/types";
import { COLOR_PALETTE_DERIVED_KEYS } from "metabase/lib/colors/types";

type ColorShades = MantineTheme["colors"]["dark"];

const allColorNames: ColorName[] = [
  "brand",
  "background-primary",
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "text-primary-inverse",
  "background-secondary",
  "shadow",
  "border",
  "filter",
  "summarize",
  "positive",
  "negative",
  ...COLOR_PALETTE_DERIVED_KEYS,
] satisfies ColorName[];

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
] as const;

export function getColorShades(colorName: string): ColorShades {
  // yes this is silly, but it makes typescript so happy
  return [
    colorName,
    colorName,
    colorName,
    colorName,
    colorName,
    colorName,
    colorName,
    colorName,
    colorName,
    colorName,
  ];
}

export function getThemeColors(
  theme: MetabaseThemeV2 | undefined,
): Record<string, ColorShades> {
  // Derive full color palette from source theme color
  const themeColorEntries = Object.entries(
    deriveColorPalette(theme?.colors ?? {}),
  ).map(([name, color]) => [name, getColorShades(color)]);

  // Populate chart colors as accent0 to accent7
  const chartColorEntries =
    Array.from({ length: 8 }).map((_, index) => [
      `accent${index}`,
      getColorShades(
        theme?.chartColors?.[index] ?? DEFAULT_CHART_COLORS[index],
      ),
    ]) ?? [];

  return {
    ...Object.fromEntries(
      ORIGINAL_COLORS.map((name) => [name, getColorShades("transparent")]),
    ),
    ...Object.fromEntries(themeColorEntries),
    ...Object.fromEntries(chartColorEntries),
  };
}

/**
 * css color variable from Metabase's theme
 * @param colorName
 * @returns string referencing a css variable
 */
export function color(colorName: ColorName | string): string {
  if (isColorName(colorName)) {
    return `var(--mb-color-${colorName})`;
  }
  return colorName;
}

export const isColorName = (name?: string | null): name is ColorName => {
  return !!name && allColorNames.includes(name as ColorName);
};

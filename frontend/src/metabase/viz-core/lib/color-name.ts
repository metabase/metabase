import { color } from "metabase/ui/colors";
import { ALL_ACCENT_COLOR_NAMES } from "metabase/ui/colors/constants/accents";
import type { MetabaseAccentColorKey } from "metabase/ui/colors/types";

const ACCENT_COLOR_NAMES = new Set<string>(ALL_ACCENT_COLOR_NAMES);

const isAccentColorName = (name: string): name is MetabaseAccentColorKey =>
  ACCENT_COLOR_NAMES.has(name);

/**
 * The color a chart should draw with: the palette color it was given when
 * there is one, so that it follows an embedding theme, and the stored value
 * otherwise. Charts saved before palette colors were recorded keep their value.
 */
export const getChartColor = (
  storedColor: string,
  colorName?: string,
): string =>
  colorName != null && isAccentColorName(colorName)
    ? color(colorName)
    : storedColor;

/**
 * Records the palette color a chart color was picked from, so that it can
 * follow an embedding theme instead of staying on the value it was given.
 */
export const withColorName = <T extends { color: string; color_name?: string }>(
  row: T,
  colorName?: string,
): T => {
  if (colorName != null) {
    return { ...row, color_name: colorName };
  }

  // A color picked outside the palette has no name, and a name left over from
  // an earlier pick would keep overriding it.
  const next = { ...row };
  delete next.color_name;

  return next;
};

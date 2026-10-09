import { adjustBrightness, tryIsDark } from "metabase/ui/colors/palette";

import type { DataGridTheme } from "../types";

export const DEFAULT_STRIPED_BACKGROUND_COLOR =
  "var(--mb-color-background-hover)";

const STRIPE_LIGHTEN_BY = 0.08;
const STRIPE_DARKEN_BY = 0.04;

export function getDefaultCellBackgroundColor(
  theme: DataGridTheme | undefined,
  isStriped: boolean | undefined,
): string | undefined {
  return isStriped
    ? getStripedBackgroundColor(theme)
    : theme?.cell?.backgroundColor;
}

export function getStripedBackgroundColor(theme?: DataGridTheme): string {
  if (theme?.stripedBackgroundColor) {
    return theme.stripedBackgroundColor;
  }

  const cellBackgroundColor = theme?.cell?.backgroundColor;
  if (!cellBackgroundColor || tryIsDark(cellBackgroundColor) == null) {
    return DEFAULT_STRIPED_BACKGROUND_COLOR;
  }

  return adjustBrightness(
    cellBackgroundColor,
    STRIPE_LIGHTEN_BY,
    STRIPE_DARKEN_BY,
  );
}

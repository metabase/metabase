import { getDarkTheme, getLightTheme } from "metabase/ui/colors";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";

import {
  applyColorOperation,
  getIsDarkThemeFromColors,
} from "./dynamic-css-vars";

export function getEmbeddingCartesianColors(
  {
    background,
    foreground,
    border,
    axis,
  }: {
    background?: string;
    foreground?: string;
    border?: string;
    axis?: string;
  },
  colorScheme: ResolvedColorScheme = "light",
) {
  const isDarkTheme = getIsDarkThemeFromColors(
    background,
    foreground,
    colorScheme,
  );
  const theme = isDarkTheme ? getDarkTheme() : getLightTheme();
  let gridlineColor = "var(--mb-color-chart-axis)";

  if (border && axis === undefined) {
    gridlineColor = applyColorOperation(border, {
      source: "border",
      alpha: isDarkTheme ? undefined : 0.5,
    });
  }

  return {
    axisColor: axis ?? border ?? theme.colors["chart-axis"],
    gridlineColor,
  };
}

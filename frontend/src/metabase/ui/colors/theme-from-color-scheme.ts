import type { ResolvedColorScheme } from "metabase/utils/color-scheme";

import { getBaseColorsForThemeDefinitionOnly } from "./constants/base-colors";
import { getDarkTheme } from "./constants/themes/dark";
import { getLightTheme } from "./constants/themes/light";
import type { MetabaseThemeV2 } from "./types";

const baseColors = getBaseColorsForThemeDefinitionOnly();

/** Returns the theme definition for a color scheme, built off the given brand ramp. */
export const getThemeFromColorScheme = (
  colorScheme: ResolvedColorScheme,
  brand: typeof baseColors.brand = baseColors.brand,
): MetabaseThemeV2 =>
  colorScheme === "dark" ? getDarkTheme(brand) : getLightTheme(brand);

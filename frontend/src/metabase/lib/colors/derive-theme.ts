import _ from "underscore";

import type { MetabaseEmbeddingThemeV2 } from "metabase/embedding-sdk/theme";
import type { ColorSettings } from "metabase-types/api";

import type { ResolvedColorScheme } from "../color-scheme";

import {
  deriveChartShadeColor,
  deriveChartTintColor,
  mapChartColorsToAccents,
} from "./accents";
import { PROTECTED_COLORS } from "./constants/protected-colors";
import { getThemeFromColorScheme } from "./theme-from-color-scheme";
import type { MetabaseColorKey, MetabaseDerivedThemeV2 } from "./types";

/**
 * Derives the _full_ metabase themes given a theme configuration.
 * Applies to both the main app and modular embedding.
 *
 * Priority: base theme colors < appearance settings whitelabel colors < modular embedding theme overrides
 *
 * TODO(EMB-984): generate lightness stops based on a single color
 * TODO(EMB-1013): generate square and octagonal color harmonies
 * TODO(EMB-1016): derive full color palette based on the given color object
 */
export function deriveFullMetabaseTheme({
  colorScheme,
  whitelabelColors,
  embeddingThemeOverride,
}: {
  colorScheme: ResolvedColorScheme;
  whitelabelColors?: ColorSettings | null;
  embeddingThemeOverride?: MetabaseEmbeddingThemeV2;
}): MetabaseDerivedThemeV2 {
  const baseTheme = getThemeFromColorScheme(colorScheme);

  // Filter out protected colors from embedding theme overrides.
  // Some colors (such as the Metabase brand color) should not be modifiable.
  const filteredEmbeddingColors = _.omit(
    embeddingThemeOverride?.colors,
    ...PROTECTED_COLORS,
  );

  const whitelabelAccentColors = Object.fromEntries(
    Object.entries(whitelabelColors ?? {}).filter(([key]) =>
      key.startsWith("accent"),
    ),
  );
  const allWhitelabelAccentColors = Object.entries(
    whitelabelAccentColors,
  ).reduce((acc, [key, value]) => {
    const [accent, variant] = key.split("-");
    let colorsToMaybeSet;
    if (variant === "light") {
      const base = deriveChartShadeColor(value);
      colorsToMaybeSet = {
        [accent]: base,
        [`${accent}-dark`]: deriveChartShadeColor(base),
      };
    } else if (variant === "dark") {
      const base = deriveChartTintColor(value);
      colorsToMaybeSet = {
        [accent]: base,
        [`${accent}-light`]: deriveChartTintColor(base),
      };
    } else {
      colorsToMaybeSet = {
        [`${accent}-light`]: deriveChartTintColor(value),
        [`${accent}-dark`]: deriveChartShadeColor(value),
      };
    }
    return {
      // acc takes priority because it's initialized with user provided whitelabelAccentColors
      ...colorsToMaybeSet,
      ...acc,
    };
  }, whitelabelAccentColors);

  const whitelabelOtherColors = Object.fromEntries(
    Object.entries(whitelabelColors ?? {}).filter(
      ([color]) => !color.startsWith("accent"),
    ),
  );

  return {
    version: 2,
    colors: {
      ...baseTheme.colors,
      ...mapChartColorsToAccents(baseTheme.chartColors),
      ...allWhitelabelAccentColors,
      ...whitelabelOtherColors,
      ...filteredEmbeddingColors,
      ...mapChartColorsToAccents(embeddingThemeOverride?.chartColors ?? []),
    } as Record<MetabaseColorKey, string>,
  };
}

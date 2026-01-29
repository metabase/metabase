import _ from "underscore";

import type { MetabaseEmbeddingThemeV2 } from "metabase/embedding-sdk/theme";
import type { ColorSettings } from "metabase-types/api";

import type { ResolvedColorScheme } from "../../color-scheme";
import { mapChartColorsToAccents } from "../accents";
import { PROTECTED_COLORS } from "../constants/protected-colors";
import { getThemeFromColorScheme } from "../theme-from-color-scheme";
import type { MetabaseColorKey, MetabaseDerivedThemeV2 } from "../types";

<<<<<<< HEAD:frontend/src/metabase/lib/colors/derives/derive-theme.ts
import { deriveColorsFromInputs } from "./derive-colors";
=======
import { mapChartColorsToAccents } from "./accents";
import { PROTECTED_COLORS } from "./constants/protected-colors";
import { getThemeFromColorScheme } from "./theme-from-color-scheme";
import type { MetabaseColorKey, MetabaseDerivedThemeV2 } from "./types";
import Color from "color";
>>>>>>> 4eceeaf8228 (temp):frontend/src/metabase/lib/colors/derive-theme.ts

/**
 * Derives the _full_ metabase themes given a theme configuration.
 * Applies to both the main app and modular embedding.
 *
 * Priority: base theme colors < appearance settings whitelabel colors < modular embedding theme overrides
 *
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

  const userColorDeriveInputs = {
    ...whitelabelColors,
    ...filteredEmbeddingColors,
  };

  const userColorDerives = deriveColorsFromInputs({
    "background-primary": baseTheme.colors["background-primary"],
    "text-primary": baseTheme.colors["text-primary"],
    brand: baseTheme.colors["brand"],
    ...userColorDeriveInputs,
  });

  return {
    version: 2,
    colors: {
      // Base: derive missing colors from base theme
      // ...deriveColorsFromInputs(baseTheme.colors),

      // Base: light and dark themes defined by Metabase
      ...baseTheme.colors,
      ...mapChartColorsToAccents(baseTheme.chartColors),

      // Derive colors from customer's three main colors.
      // Priority: whitelabel < modular embedding
      ...userColorDerives,

      // Colors set thru appearance settings e.g. brand, filter, summarize.
      ...whitelabelColors,

      // Colors set thru modular embedding theme prop.
      ...filteredEmbeddingColors,
      ...mapChartColorsToAccents(embeddingThemeOverride?.chartColors ?? []),
    } as Record<MetabaseColorKey, string>,
  };
}

type AccessoryColors = Extract<
  MetabaseColorKey,
  "filter" | "summarize" | "accent0" | "accent1"
>;

export const suggestColors = (
  _brand: string,
): Record<AccessoryColors, string> => {
  const brand = Color(_brand);

  const getChartColor = (index) =>
    brand
      .rotate(index * 45)
      .rgb()
      .toString();

  return {
    filter: brand.rotate(90).rgb().toString(),
    summarize: brand.rotate(-90).rgb().toString(),
    positive: brand.hue(359).rgb().toString(),
    negative: brand.hue(89).rgb().toString(),
    chart1: getChartColor(0),
    chart2: getChartColor(1),
    chart3: getChartColor(2),
    chart4: getChartColor(3),
    chart5: getChartColor(4),
    chart6: getChartColor(5),
    chart7: getChartColor(6),
    chart8: getChartColor(7),
  };
};

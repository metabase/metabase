import _ from "underscore";

import type { ResolvedColorScheme } from "metabase/utils/color-scheme";
import type { ColorSettings } from "metabase-types/api";

import { deriveAllAccentColors, mapChartColorsToAccents } from "./accents";
import { getBaseColorsForThemeDefinitionOnly } from "./constants/base-colors";
import { PROTECTED_COLORS } from "./constants/protected-colors";
import { mapWhitelabelColorsToTokens } from "./constants/whitelabel-colors";
import { getThemeFromColorScheme } from "./theme-from-color-scheme";
import type {
  MetabaseColorKey,
  MetabaseDerivedThemeV2,
  MetabaseEmbeddingThemeV2,
} from "./types";

/**
 * Derives the _full_ metabase themes given a theme configuration.
 * Applies to both the main app and modular embedding.
 *
 * Priority: base theme colors < appearance settings whitelabel colors < modular embedding theme overrides
 *
 * TODO(EMB-984): generate lightness stops based on a single color
 * TODO(EMB-1016): derive full color palette based on the given color object
 */
export function deriveFullMetabaseTheme({
  colorScheme,
  whitelabelColors,
  embeddingThemeOverride,
  forceDynamicBrandRamp = false,
}: {
  colorScheme: ResolvedColorScheme;
  whitelabelColors?: ColorSettings | null;
  embeddingThemeOverride?: MetabaseEmbeddingThemeV2;
  forceDynamicBrandRamp?: boolean;
}): MetabaseDerivedThemeV2 {
  // Filter out protected colors from embedding theme overrides.
  // Some colors (such as the Metabase brand color) should not be modifiable.
  const filteredEmbeddingColors = _.omit(
    embeddingThemeOverride?.colors,
    ...PROTECTED_COLORS,
  );

  const embeddingColors = embeddingThemeOverride?.colors;

  // When instance doesn't have custom brand color configured, we replace brand
  // ramp (which is generated dynamically using color-mix to work with custom colors)
  // with a hand-picked `ocean` ramp
  const shouldKeepBrandRampDynamic =
    forceDynamicBrandRamp ||
    Boolean(embeddingColors?.["core-brand"] ?? whitelabelColors?.brand);

  const baseColors = getBaseColorsForThemeDefinitionOnly();

  const baseTheme = getThemeFromColorScheme(
    colorScheme,
    shouldKeepBrandRampDynamic ? baseColors.brand : baseColors.ocean,
  );

  // Unjustified type cast. FIXME
  const colors = {
    ...baseTheme.colors,
    ...mapChartColorsToAccents(baseTheme.chartColors),
    ...deriveAllAccentColors(mapWhitelabelColorsToTokens(whitelabelColors)),
    ...filteredEmbeddingColors,
    ...mapChartColorsToAccents(embeddingThemeOverride?.chartColors ?? []),
  } as Record<MetabaseColorKey, string>;

  return { version: 2, colors };
}

import _ from "underscore";

import type { ResolvedColorScheme } from "metabase/utils/color-scheme";
import type { ColorSettings } from "metabase-types/api";

import { deriveAllAccentColors, mapChartColorsToAccents } from "./accents";
import { resolveBrandRampToOcean } from "./constants/brand-ramp";
import { PROTECTED_COLORS } from "./constants/protected-colors";
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
  const baseTheme = getThemeFromColorScheme(colorScheme);

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
    Boolean(
      embeddingColors?.["core-brand"] ??
      embeddingColors?.brand ??
      whitelabelColors?.brand,
    );

  // Unjustified type cast. FIXME
  const colors = {
    ...(shouldKeepBrandRampDynamic
      ? baseTheme.colors
      : // baseTheme is created on module init, before we have an opportunity to check
        // if instance has custom brand color set. Because of this we replace value of
        // every semantic token matching one of default brand ramp stops with matching
        // stop from ocean ramp (as opposed to modifying baseColors.brand directly)
        resolveBrandRampToOcean(baseTheme.colors)),
    ...mapChartColorsToAccents(baseTheme.chartColors),
    ...deriveAllAccentColors(whitelabelColors ?? {}),
    ...filteredEmbeddingColors,
    ...mapChartColorsToAccents(embeddingThemeOverride?.chartColors ?? []),
  } as Record<MetabaseColorKey, string>;

  // These 3 assignments are temporary compatibility layer for colors migration (GDGT-2517)
  // Custom brand, filter, and summarize colors (whitelabelling) are passed directly from settings
  // as part of `whitelabelColors` into `deriveAllAccentColors` which passes them through without
  // any processing (as they aren't accent colors), and this way they get included in colors object.
  // But brand colors might be also overriden by embedding (`filteredEmbeddingColors`). To ensure that
  // colors available by new name (core-*) always match actual brand/filter/summarize we copy there
  // here, after all possible overrides are done, instead of e.g. extending original `whitelabelColors`
  colors["core-brand"] = colors.brand;
  colors["core-filter"] = colors.filter;
  colors["core-summarize"] = colors.summarize;

  return { version: 2, colors };
}

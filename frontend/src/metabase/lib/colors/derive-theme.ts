import type { MetabaseEmbeddingThemeV2 } from "metabase/embedding-sdk/theme";
import type { ColorSettings } from "metabase-types/api";

import { mapChartColorsToAccents } from "./accents";
import { PROTECTED_COLORS } from "./constants/protected-colors";
import type {
  MetabaseColorKey,
  MetabaseDerivedThemeV2,
  MetabaseThemeV2,
} from "./types";

/**
 * Derives the _full_ metabase themes given a theme configuration.
 * Applies to both the main app and modular embedding.
 *
 * Priority: base theme colors < appearance settings whitelabel colors < modular embedding theme overrides
 *
 * TODO(EMB-1016): derive full color palette based on the given color object
 */
export function deriveFullMetabaseTheme({
  baseTheme,
  whitelabelColors,
  embeddingThemeOverride,
}: {
  baseTheme: MetabaseThemeV2;
  whitelabelColors?: ColorSettings;
  embeddingThemeOverride?: MetabaseEmbeddingThemeV2;
}): MetabaseDerivedThemeV2 {
  // Filter out protected colors from embedding theme overrides.
  // Some colors (such as the Metabase brand color) should not be modifiable.
  const filteredUserColors = _.omit(
    embeddingThemeOverride?.colors,
    ...PROTECTED_COLORS,
  );

  // Transform embedding user's chart colors to accent0 - accent7
  const embeddingChartColors = mapChartColorsToAccents(
    embeddingThemeOverride?.chartColors ?? [],
  );

  return {
    version: 2,
    colors: {
      ...baseTheme.colors,
      ...mapChartColorsToAccents(baseTheme.chartColors),
      ...whitelabelColors,
      ...filteredUserColors,
      ...embeddingChartColors,
    } as Record<MetabaseColorKey, string>,
  };
}

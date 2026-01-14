import { useMemo } from "react";

import { DEFAULT_FONT } from "embedding-sdk-bundle/config";
import { getEmbeddingThemeOverride } from "embedding-sdk-bundle/lib/theme";
import { applyThemePreset } from "embedding-sdk-shared/lib/apply-theme-preset";
import { useSetting } from "metabase/common/hooks";
import {
  type MetabaseEmbeddingTheme,
  isEmbeddingThemeV1,
  isEmbeddingThemeV2,
} from "metabase/embedding-sdk/theme";
import { setGlobalEmbeddingColors } from "metabase/embedding-sdk/theme/embedding-color-palette";
import {
  METABASE_LIGHT_THEME,
  deriveFullMetabaseTheme,
} from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { getFont } from "metabase/styled-components/selectors";
import type { MantineThemeOverride } from "metabase/ui";
import { getColorShades } from "metabase/ui/utils/colors";

/**
 * Returns the Mantine theme override for modular embedding.
 */
export function useEmbeddingThemeOverride(
  theme?: MetabaseEmbeddingTheme,
): MantineThemeOverride | undefined {
  const font = useSelector(getFont);
  const appColors = useSetting("application-colors");

  return useMemo(() => {
    if (isEmbeddingThemeV1(theme)) {
      const themeWithPreset = applyThemePreset(theme);

      // !! Mutate the global colors object to apply the new colors.
      // This must be done before ThemeProvider calls getThemeOverrides.
      setGlobalEmbeddingColors(themeWithPreset?.colors, appColors ?? {});

      return getEmbeddingThemeOverride(themeWithPreset || {}, font);
    }

    if (isEmbeddingThemeV2(theme)) {
      const derivedTheme = deriveFullMetabaseTheme({
        baseTheme: METABASE_LIGHT_THEME,
        whitelabelColors: appColors ?? {},
        embeddingThemeOverride: theme,
      });

      // Convert derived colors to Mantine color tuples
      const colors = Object.fromEntries(
        Object.entries(derivedTheme.colors).map(([key, value]) => [
          key,
          getColorShades(value),
        ]),
      );

      return { colors, fontFamily: font ?? DEFAULT_FONT };
    }
  }, [appColors, theme, font]);
}

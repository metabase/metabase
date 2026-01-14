import { useMemo } from "react";

import { DEFAULT_FONT } from "embedding-sdk-bundle/config";
import { getEmbeddingThemeOverride } from "embedding-sdk-bundle/lib/theme";
import { applyThemePreset } from "embedding-sdk-shared/lib/apply-theme-preset";
import { useSetting } from "metabase/common/hooks";
import { setGlobalEmbeddingColors } from "metabase/embedding-sdk/theme/embedding-color-palette";
import {
  type MetabaseEmbeddingTheme,
  isThemeV1,
  isThemeV2,
} from "metabase/embedding-sdk/theme/theme-version";
import {
  getThemeFromColorScheme,
  resolveTheme,
} from "metabase/lib/colors/theme";
import { useSelector } from "metabase/lib/redux";
import { getFont } from "metabase/styled-components/selectors";
import type { MantineThemeOverride } from "metabase/ui";
import { getColorShades } from "metabase/ui/utils/colors";

/**
 * Computes the Mantine theme override for the embedding SDK.
 *
 * For V2 themes: Resolves theme using the layered override system
 * (baseTheme > whitelabelColors > userThemeOverride).
 *
 * For V1 themes: Uses the existing processing pipeline with global color mutation.
 */
export function useEmbeddingThemeOverride(
  theme?: MetabaseEmbeddingTheme,
): MantineThemeOverride | undefined {
  const font = useSelector(getFont);
  const appColors = useSetting("application-colors");

  return useMemo(() => {
    if (isThemeV1(theme)) {
      const themeWithPreset = applyThemePreset(theme);

      // !! Mutate the global colors object to apply the new colors.
      // This must be done before ThemeProvider calls getThemeOverrides.
      setGlobalEmbeddingColors(themeWithPreset?.colors, appColors ?? {});

      return getEmbeddingThemeOverride(themeWithPreset || {}, font);
    }

    if (isThemeV2(theme)) {
      const resolvedTheme = resolveTheme({
        baseTheme: getThemeFromColorScheme("light"),
        whitelabelColors: appColors ?? {},
        userThemeOverride: theme,
      });

      // Convert resolved colors to Mantine color tuples
      const colors = Object.fromEntries(
        Object.entries(resolvedTheme.colors).map(([key, value]) => [
          key,
          getColorShades(value),
        ]),
      );

      return {
        colors,
        fontFamily: font ?? DEFAULT_FONT,
      };
    }
  }, [appColors, theme, font]);
}

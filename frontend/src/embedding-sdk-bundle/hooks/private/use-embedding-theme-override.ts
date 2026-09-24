import { useMemo } from "react";

import { DEFAULT_FONT } from "embedding-sdk-bundle/config";
import { getEmbeddingThemeOverride } from "embedding-sdk-bundle/lib/theme";
import { applyThemePreset } from "embedding-sdk-shared/lib/apply-theme-preset";
import {
  type MetabaseEmbeddingTheme,
  getEmbeddingComponentOverrides,
  isEmbeddingThemeV1,
  isEmbeddingThemeV2,
} from "metabase/embedding-sdk/theme";
import { getEmbeddingCartesianColors } from "metabase/embedding-sdk/theme/cartesian-colors";
import { setGlobalEmbeddingColors } from "metabase/embedding-sdk/theme/embedding-color-palette";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { getFont } from "metabase/styled-components/selectors";
import {
  DEFAULT_METABASE_COMPONENT_THEME,
  type MantineThemeOverride,
  useColorScheme,
} from "metabase/ui";
import { deriveFullMetabaseTheme } from "metabase/ui/colors";
import { getColorShades } from "metabase/ui/utils/colors";

/**
 * Returns the Mantine theme override for modular embedding.
 */
export function useEmbeddingThemeOverride(
  theme?: MetabaseEmbeddingTheme,
): MantineThemeOverride | undefined {
  const font = useSelector(getFont);
  const appColors = useSetting("application-colors");
  const { resolvedColorScheme } = useColorScheme();

  return useMemo(() => {
    if (!theme || isEmbeddingThemeV1(theme)) {
      const themeWithPreset = applyThemePreset(theme);

      // !! Mutate the global colors object to apply the new colors.
      // This must be done before ThemeProvider calls getThemeOverrides.
      setGlobalEmbeddingColors(themeWithPreset?.colors, appColors ?? {});

      return getEmbeddingThemeOverride(
        theme || {},
        font,
        appColors ?? {},
        resolvedColorScheme,
      );
    }

    // We must include Modular Embedding specific overrides for portals (e.g. popover and modal) to target the correct portal id
    const components = getEmbeddingComponentOverrides();

    if (isEmbeddingThemeV2(theme)) {
      const derivedTheme = deriveFullMetabaseTheme({
        colorScheme: "light",
        whitelabelColors: appColors ?? {},
        embeddingThemeOverride: theme,
      });
      const { axisColor, gridlineColor } = getEmbeddingCartesianColors(
        {
          background: derivedTheme.colors["background_page-primary"],
          foreground: derivedTheme.colors["text-primary"],
          border: theme.colors?.border,
          axis: theme.colors?.["chart-axis"],
        },
        resolvedColorScheme,
      );

      // Convert derived colors to Mantine color tuples
      const colors = Object.fromEntries(
        Object.entries(derivedTheme.colors).map(([key, value]) => [
          key,
          getColorShades(value),
        ]),
      );

      return {
        colors: { ...colors, "chart-axis": getColorShades(axisColor) },
        fontFamily: font ?? DEFAULT_FONT,
        components,
        other: {
          cartesian: {
            ...DEFAULT_METABASE_COMPONENT_THEME.cartesian,
            splitLine: { lineStyle: { color: gridlineColor } },
          },
        },
      };
    }

    // No theme provided: just return the component overrides for portals
    return { components };
  }, [appColors, theme, font, resolvedColorScheme]);
}

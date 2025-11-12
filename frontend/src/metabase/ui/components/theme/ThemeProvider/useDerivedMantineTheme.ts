import type { MantineTheme, MantineThemeOverride } from "@mantine/core";
import { merge } from "icepick";
import { useEffect, useMemo } from "react";

import {
  DEFAULT_CHART_COLORS,
  deriveColorPalette,
  mutateColors,
} from "metabase/lib/colors";
import type { ColorPalette, MetabaseThemeV2 } from "metabase/lib/colors/types";

import { getThemeOverrides } from "../../../theme";
import type { ResolvedColorScheme } from "../ColorSchemeProvider/ColorSchemeProvider";

interface UseDerivedThemeOverrideOptions {
  /** Are we in light or dark mode? */
  resolvedColorScheme: ResolvedColorScheme;

  /** Theme objects for theming both main app and embedding. */
  theme?: MetabaseThemeV2;

  /** Currently used for Embedding SDK's legacy theme. */
  themeOverride?: MantineThemeOverride;
}

/**
 * Derives a MantineThemeOverride from MetabaseThemeV2 or legacy themeOverride.
 *
 * This hook processes MetabaseThemeV2 (if provided) by:
 * 1. Generating a complete color palette
 * 2. Mutating the global colors object
 * 3. Creating Mantine theme overrides
 *
 * If both theme and themeOverride are provided, theme takes precedence.
 * If neither is provided, falls back to colorScheme-based theme.
 */
export function useDerivedMantineTheme(
  options: UseDerivedThemeOverrideOptions,
): MantineTheme {
  const { theme, resolvedColorScheme, themeOverride } = options;

  const colorPalette = useMemo(() => {
    const palette: ColorPalette = {
      ...deriveColorPalette(theme?.colors ?? {}),
    };

    // Populate accent0 - accent7 with chart colors.
    (theme?.chartColors ?? DEFAULT_CHART_COLORS).forEach((color, index) => {
      palette[`accent${index}` as keyof ColorPalette] = color;
    });

    return palette;
  }, [theme]);

  useEffect(() => {
    if (colorPalette) {
      mutateColors(colorPalette);
    }
  }, [colorPalette]);

  return useMemo(() => {
    const derivedTheme = getThemeOverrides({
      theme,
      colorScheme: resolvedColorScheme,
    });

    // Embedding SDK's legacy theme system generates its own `themeOverride`.
    return merge(derivedTheme, themeOverride) as MantineTheme;
  }, [theme, resolvedColorScheme, themeOverride]);
}

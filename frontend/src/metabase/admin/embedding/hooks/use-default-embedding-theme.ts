import { useMemo } from "react";

import { useSetting } from "metabase/common/hooks";
import type {
  MetabaseColor,
  MetabaseColors,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";
import { SDK_TO_MAIN_APP_COLORS_MAPPING } from "metabase/embedding-sdk/theme/embedding-color-palette";
import { getColors } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";

/**
 * These SDK colors are used by the embedding theme editor:
 *
 * - To reset the colors back to its defaults.
 * - To create a default theme object that is frozen in time.
 *
 * TODO(EMB-948): derive this from the theme editor's color configuration instead!
 */
const SDK_COLORS_TO_PERSIST = [
  // Three main colors
  "brand",
  "background",
  "text-primary",

  // Additional colors
  "text-secondary",
  "text-tertiary",
  "border",
  "background-secondary",
  "filter",
  "summarize",
  "positive",
  "negative",
  "shadow",
  "charts",
] as const satisfies MetabaseColor[];

/**
 * Default chart color names from appearance settings.
 *
 * The theme editor only defines 8 colors,
 * so we do not need the `-light` or `-dark` variants,
 * even though the SDK supports them.
 */
export const WHITELABEL_CHART_COLOR_NAMES = [
  "accent0",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "accent7",
] as const satisfies ColorName[];

/**
 * Returns a default embedding theme with colors mapped from the instance's
 * appearance settings (white-labeled colors).
 *
 * The theme includes all the essential SDK colors mapped from the main app's
 * color palette, using the instance's brand, filter, summarize, and chart colors.
 */
export function useDefaultEmbeddingTheme(): MetabaseTheme {
  const whitelabelColors = useSetting("application-colors");

  return useMemo(() => {
    // Refer to Metabase's light colors.
    const sourceColors = getColors(whitelabelColors ?? {});

    // Map SDK colors from main app colors using the SDK_TO_MAIN_APP_COLORS_MAPPING
    const mappedColors: MetabaseColors = {};

    for (const sdkColorKey of SDK_COLORS_TO_PERSIST) {
      // Map the chart colors from appearance settings & default colors.
      if (sdkColorKey === "charts") {
        mappedColors[sdkColorKey] = WHITELABEL_CHART_COLOR_NAMES.map(
          (colorName) =>
            whitelabelColors?.[colorName] ?? sourceColors[colorName],
        );

        continue;
      }

      // One SDK color can be mapped to multiple main app colors.
      const colorKeys = SDK_TO_MAIN_APP_COLORS_MAPPING[sdkColorKey];

      // Try each mapped color key until we find one that is defined.
      if (colorKeys.length > 0) {
        for (const colorKey of colorKeys) {
          const colorValue = sourceColors[colorKey];

          if (colorValue !== undefined) {
            mappedColors[sdkColorKey] = colorValue;
            break;
          }
        }
      }
    }

    return { colors: mappedColors };
  }, [whitelabelColors]);
}

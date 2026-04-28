import type {
  MetabaseColor,
  MetabaseColors,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";
import { SDK_TO_MAIN_APP_COLORS_MAPPING } from "metabase/embedding-sdk/theme/embedding-color-palette";
import { deriveFullMetabaseTheme } from "metabase/ui/colors/derive-theme";
import { ACCENT_COUNT } from "metabase/ui/colors/palette";
import type { ColorName } from "metabase/ui/colors/types";
import type { ColorSettings } from "metabase-types/api/settings";

type ColorScheme = "light" | "dark";

const SDK_COLORS_TO_PERSIST = [
  "brand",
  "background",
  "text-primary",
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

export const WHITELABEL_CHART_COLOR_NAMES = Array.from(
  { length: ACCENT_COUNT },
  (_, i) => `accent${i}` as ColorName,
);

export function deriveSdkThemeSettings(
  colorScheme: ColorScheme,
  whitelabelColors: ColorSettings = {},
): MetabaseTheme {
  const sourceColors = deriveFullMetabaseTheme({
    colorScheme,
    whitelabelColors,
  }).colors;

  const mappedColors: MetabaseColors = {};

  for (const sdkColorKey of SDK_COLORS_TO_PERSIST) {
    if (sdkColorKey === "charts") {
      mappedColors.charts = WHITELABEL_CHART_COLOR_NAMES.map(
        (colorName) => whitelabelColors?.[colorName] ?? sourceColors[colorName],
      );

      continue;
    }

    const colorKeys = SDK_TO_MAIN_APP_COLORS_MAPPING[sdkColorKey];

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
}

import type {
  ColorSettings,
  ColorSettingsAccentKey,
  ColorSettingsKey,
} from "metabase-types/api/settings";

import type { ColorPalette } from "../types";
import type { MetabaseColorKey } from "../types/color-keys";

/**
 * The admin appearance form and the `application-colors` setting keep addressing
 * these three colors by their older names (see GDGT-2517), so whitelabel values arrive
 * keyed by `brand`/`filter`/`summarize` and have to be translated to the token
 * names the app actually reads.
 *
 * The SDK v1 theme keeps the same public names but is translated separately, by
 * `SDK_TO_MAIN_APP_COLORS_MAPPING`.
 */
export const WHITELABEL_KEY_TO_COLOR_KEY = {
  brand: "core-brand",
  filter: "core-filter",
  summarize: "core-summarize",
} as const satisfies Partial<Record<ColorSettingsKey, MetabaseColorKey>>;

export type WhitelabelSettingKey = keyof typeof WHITELABEL_KEY_TO_COLOR_KEY;

export type WhitelabelColorKey =
  (typeof WHITELABEL_KEY_TO_COLOR_KEY)[WhitelabelSettingKey];

export const WHITELABEL_ACCENT_KEYS = [
  "accent0",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "accent7",
] as const satisfies readonly ColorSettingsAccentKey[];

const WHITELABEL_SETTING_KEYS: WhitelabelSettingKey[] = [
  "brand",
  "filter",
  "summarize",
];

export function mapWhitelabelColorsToTokens(
  colors: ColorSettings | null | undefined,
): ColorPalette {
  if (!colors) {
    return {};
  }

  const { brand, filter, summarize, ...accents } = colors;
  const tokens: ColorPalette = { ...accents };

  for (const settingKey of WHITELABEL_SETTING_KEYS) {
    const value = colors[settingKey];
    if (value !== undefined) {
      tokens[WHITELABEL_KEY_TO_COLOR_KEY[settingKey]] = value;
    }
  }

  return tokens;
}

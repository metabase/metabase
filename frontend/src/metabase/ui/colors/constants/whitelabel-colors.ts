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
} as const satisfies Record<string, MetabaseColorKey>;

export type WhitelabelSettingKey = keyof typeof WHITELABEL_KEY_TO_COLOR_KEY;

export type WhitelabelColorKey =
  (typeof WHITELABEL_KEY_TO_COLOR_KEY)[WhitelabelSettingKey];

const isWhitelabelSettingKey = (key: string): key is WhitelabelSettingKey =>
  Object.hasOwn(WHITELABEL_KEY_TO_COLOR_KEY, key);

export function mapWhitelabelColorsToTokens<T>(
  colors: Record<string, T> | null | undefined,
): Record<string, T> {
  if (!colors) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(colors).map(([key, value]) => [
      isWhitelabelSettingKey(key) ? WHITELABEL_KEY_TO_COLOR_KEY[key] : key,
      value,
    ]),
  );
}

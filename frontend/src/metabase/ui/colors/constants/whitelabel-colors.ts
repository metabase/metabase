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

export type WhitelabelColorKey =
  (typeof WHITELABEL_KEY_TO_COLOR_KEY)[keyof typeof WHITELABEL_KEY_TO_COLOR_KEY];

export function mapWhitelabelColorToTokens<T>(
  colors: Record<string, T> | null | undefined,
): Record<string, T> {
  if (!colors) {
    return {};
  }

  return Object.fromEntries(
    // Widen WHITELABEL_KEY_TO_COLOR_KEY to generic mapping so arbitrary setting keys can be looked up, misses fall through.
    Object.entries(colors).map(([key, value]) => [
      (WHITELABEL_KEY_TO_COLOR_KEY as Record<string, string>)[key] ?? key,
      value,
    ]),
  );
}

type ColorSettingsAccentIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ColorSettingsAccentKey =
  | `accent${ColorSettingsAccentIndex}`
  | `accent${ColorSettingsAccentIndex}-light`
  | `accent${ColorSettingsAccentIndex}-dark`;

/** Keys that the `application-colors` setting stores. */
export type ColorSettingsKey =
  | "brand"
  | "filter"
  | "summarize"
  | ColorSettingsAccentKey;

/**
 * The raw `application-colors` setting. Its keys are not color token names:
 * translate it with `mapWhitelabelColorsToTokens` before you use it as a `ColorPalette`.
 */
export type ColorSettings = Partial<Record<ColorSettingsKey, string>> & {
  "core-brand"?: never;
  "core-filter"?: never;
  "core-summarize"?: never;
};

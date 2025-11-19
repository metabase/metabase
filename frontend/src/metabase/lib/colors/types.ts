/**
 * Customizable color palettes for Metabase.
 */
export interface MetabaseColorsV2 {
  // --- Main colors ---

  /** Primary brand color */
  brand: string;

  /** Primary background color  */
  "background-primary": string;

  /** Primary text color  */
  "text-primary": string;

  // --- Supporting colors ---

  /** Secondary text color */
  "text-secondary": string;

  /** Tertiary text color */
  "text-tertiary": string;

  /** Primary text color for inverse backgrounds */
  "text-primary-inverse": string;

  /** Secondary background color */
  "background-secondary": string;

  /** Shadow color */
  shadow: string;

  /** Border color for dividers and outlines */
  border: string;

  /** Color for query builder filter */
  filter: string;

  /** Color for query builder summarize/aggregation */
  summarize: string;

  /** Color for positive states (success, increase) */
  positive: string;

  /** Color for negative states (error, decrease) */
  negative: string;
}

/**
 * Semantic colors that are derived from the main theme colors.
 * These keys are not customizable via the theming system.
 */
export const COLOR_PALETTE_DERIVED_KEYS = [
  "accent-gray-dark",
  "accent-gray-light",
  "accent-gray",
  "admin-navbar",
  "admin-navbar-secondary",
  "admin-navbar-inverse",
  "background-brand",
  "background-disabled",
  "background-disabled-inverse",
  "background-error-secondary",
  "background-hover",
  "background-hover-light",
  "background-selected",
  "background-tertiary",
  "background-primary-inverse",
  "background-secondary-inverse",
  "background-tertiary-inverse",
  "overlay",
  "background-error",
  "brand-alpha-04",
  "brand-alpha-88",
  "brand-dark",
  "brand-darker",
  "brand-light",
  "brand-lighter",
  "danger",
  "error",
  "focus",
  "icon-primary-disabled",
  "icon-primary",
  "icon-secondary-disabled",
  "icon-secondary",
  "metabase-brand",
  "saturated-blue",
  "saturated-green",
  "saturated-purple",
  "saturated-red",
  "saturated-yellow",
  "success-secondary",
  "success",
  "switch-off",
  "syntax-parameters-active",
  "syntax-parameters",
  "text-brand",
  "text-disabled",
  "text-disabled-inverse",
  "text-hover",
  "text-secondary-opaque",
  "text-secondary-inverse",
  "text-selected",
  "tooltip-background-focused",
  "tooltip-background",
  "tooltip-text-secondary",
  "tooltip-text",
  "warning",
  "background-warning",
  "info",
  "background-info",
  "white",
  "accent0",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "accent7",
  "border-strong",
  "border-subtle",
] as const;

export type ColorPaletteDerivedKey =
  (typeof COLOR_PALETTE_DERIVED_KEYS)[number];

/**
 * ColorPalette extends MetabaseColorsV2 with all remaining semantic color keys.
 * This type represents the complete internal color system.
 * All fields are partial to maintain backward compatibility.
 */
export type ColorPalette = Partial<MetabaseColorsV2> &
  Partial<Record<ColorPaletteDerivedKey, string>>;

export type ColorName = keyof MetabaseColorsV2 | ColorPaletteDerivedKey;

export interface AccentColorOptions {
  main?: boolean;
  light?: boolean;
  dark?: boolean;
  harmony?: boolean;
  gray?: boolean;
}

/**
 * Theme configuration for Metabase.
 *
 * Version 2 of the theme object supports both embedding and internal use.
 */
export interface MetabaseThemeV2 {
  /** Theme version should be 2. */
  version: 2;

  /** Color palette. */
  colors?: Partial<MetabaseColorsV2>;

  /** 8 chart colors. */
  chartColors?: string[];

  /** Custom font family. Currently used for React SDK. */
  fontFamily?: string;
}

/**
 * Type guard to check if a theme object is MetabaseThemeV2.
 * @param theme - The theme object to check
 * @returns true if the theme is MetabaseThemeV2, false otherwise
 */
export const isMetabaseThemeV2 = (theme: unknown): theme is MetabaseThemeV2 =>
  typeof theme === "object" &&
  theme !== null &&
  "version" in theme &&
  theme.version === 2;

/**
 * Type guard to check if a theme object is MetabaseThemeV1 (legacy theme without version field).
 * @param theme - The theme object to check
 * @returns true if the theme is MetabaseThemeV1 (no version field or version !== 2), false otherwise
 */
export const isMetabaseThemeV1 = (theme: unknown): boolean =>
  typeof theme === "object" &&
  theme !== null &&
  (!("version" in theme) || theme.version !== 2);

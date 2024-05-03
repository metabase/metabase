import type { MantineThemeOverride } from "@mantine/core";

export interface MetabaseTheme {
  /** Base font size */
  fontSize?: string;

  /** Base line height */
  lineHeight?: string | number;

  /** Color palette */
  colors?: MetabaseColors;

  /** Component theme options */
  components?: MetabaseComponentTheme;
}

export interface MetabaseColors {
  /** Primary brand color */
  brand?: string;

  /** Text color on dark elements. Should be a lighter color for readability. */
  "text-dark"?: string;

  /** Text color on light elements. Should be a darker color for readability. */
  "text-light"?: string;
}

export type MetabaseColor = keyof MetabaseColors;

/**
 * Theme options for Metabase components and visualizations.
 */
interface MetabaseComponentTheme {}

/**
 * Mantine theme overrides with theme options specific to React embedding.
 *
 * We use this type instead of declaration merging
 * to avoid polluting the metabase-ui Mantine type with
 * theme configuration that only applies to React embedding SDK.
 */
export type EmbeddingThemeOverride = MantineThemeOverride & {
  other?: MetabaseComponentTheme;
};

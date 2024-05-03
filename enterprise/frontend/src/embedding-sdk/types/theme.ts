import type { MantineThemeOverride } from "@mantine/core";

export type MetabaseColor = "brand" | "text-dark" | "text-light";
export type MetabaseColors = Partial<Record<MetabaseColor, string>>;

export interface MetabaseTheme {
  fontSize?: string;
  lineHeight?: string;
  colors?: MetabaseColors;
  components?: MetabaseComponentTheme;
}

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

import type { MantineThemeOverride, MantineTheme } from "@mantine/core";

import type { MetabaseComponentTheme } from ".";

/**
 * Mantine theme overrides with theme options specific to React embedding.
 *
 * We use this type instead of declaration merging
 * to avoid polluting the metabase-ui Mantine type with
 * theme configuration that only applies to React embedding SDK.
 */
export type EmbeddingThemeOverride = MantineThemeOverride & {
  other?: EmbeddingThemeOptions;
};

/**
 * Mantine theme options specific to React embedding.
 */
export type EmbeddingThemeOptions = MetabaseComponentTheme & {
  /** Base font size */
  fontSize?: string;
};

/**
 * Mantine theme for React embedding.
 */
export type EmbeddingTheme = MantineTheme & {
  other?: EmbeddingThemeOptions;
};

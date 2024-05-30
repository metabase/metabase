import type { MetabaseComponentTheme } from ".";

/**
 * Mantine theme options specific to React embedding.
 */
export type EmbeddingThemeOptions = MetabaseComponentTheme & {
  /** Base font size */
  fontSize?: string;
};

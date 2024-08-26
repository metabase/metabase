import type { MetabaseComponentTheme, MetabaseTheme } from ".";

/**
 * Mantine theme options specific to React embedding.
 */
export type EmbeddingThemeOptions = MetabaseComponentTheme &
  Pick<MetabaseTheme, "fontSize">;

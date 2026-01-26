import type { MetabaseTheme } from "./MetabaseTheme";
import type { MetabaseEmbeddingThemeV2 } from "./MetabaseThemeV2";

/**
 * Theme configuration for embedded Metabase components.
 *
 * @category Theming
 */
export type MetabaseEmbeddingTheme = MetabaseTheme | MetabaseEmbeddingThemeV2;

export function isEmbeddingThemeV2(
  theme: MetabaseEmbeddingTheme | undefined,
): theme is MetabaseEmbeddingThemeV2 {
  return theme !== undefined && "version" in theme && theme.version === 2;
}

export function isEmbeddingThemeV1(
  theme: MetabaseEmbeddingTheme | undefined,
): theme is MetabaseTheme {
  return theme !== undefined && !isEmbeddingThemeV2(theme);
}

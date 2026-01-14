import type { MetabaseTheme } from "./MetabaseTheme";
import type { MetabaseEmbeddingThemeV2 } from "./MetabaseThemeV2";

/**
 * Union type representing either V1 or V2 SDK theme.
 */
export type MetabaseEmbeddingTheme = MetabaseTheme | MetabaseEmbeddingThemeV2;

/**
 * Type guard to check if a theme is V2.
 */
export function isEmbeddingThemeV2(
  theme: MetabaseEmbeddingTheme | undefined,
): theme is MetabaseEmbeddingThemeV2 {
  return theme !== undefined && "version" in theme && theme.version === 2;
}

/**
 * Type guard to check if a theme is V1 (or no version specified).
 */
export function isEmbeddingThemeV1(
  theme: MetabaseEmbeddingTheme | undefined,
): theme is MetabaseTheme {
  return theme !== undefined && !isEmbeddingThemeV2(theme);
}

import type { MetabaseTheme } from "./MetabaseTheme";
import type { MetabaseEmbedThemeV2 } from "./MetabaseThemeV2";

/**
 * Union type representing either V1 or V2 SDK theme.
 */
export type MetabaseSdkTheme = MetabaseTheme | MetabaseEmbedThemeV2;

/**
 * Type guard to check if a theme is V2.
 */
export function isThemeV2(
  theme: MetabaseSdkTheme | undefined,
): theme is MetabaseEmbedThemeV2 {
  return theme !== undefined && "version" in theme && theme.version === 2;
}

/**
 * Type guard to check if a theme is V1 (or no version specified).
 */
export function isThemeV1(
  theme: MetabaseSdkTheme | undefined,
): theme is MetabaseTheme {
  return theme !== undefined && !isThemeV2(theme);
}

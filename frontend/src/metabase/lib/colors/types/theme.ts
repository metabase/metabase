import type { MetabaseColorKey } from "./color-keys";

/** A complete Metabase theme with all color values defined. */
export interface MetabaseThemeV2 {
  version: 2;
  colors: Record<MetabaseColorKey, string>;
}

/** Lets users define chart colors. */
export type ChartColorV2 =
  | string
  | { base: string; tint?: string; shade?: string };

export type {
  ChartColorV2,
  MetabaseThemeV2,
  MetabaseDerivedThemeV2,
} from "./theme";

import type { MetabaseColorKey } from "./color-keys";

export type ColorPalette = Partial<Record<MetabaseColorKey, string>>;
export type ColorName = MetabaseColorKey;

export type * from "./color-keys";
export type * from "./accent-color-options";

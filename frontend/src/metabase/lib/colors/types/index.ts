export type {
  ChartColorV2,
  MetabaseThemeV2,
  MetabaseDerivedThemeV2,
} from "./theme";

import type { PROTECTED_COLORS } from "../constants/protected-colors";

import type { MetabaseColorKey } from "./color-keys";

export interface AccentColorOptions {
  main?: boolean;
  light?: boolean;
  dark?: boolean;
  harmony?: boolean;
  gray?: boolean;
}

/**
 * Color keys that are protected and should not be exposed to embedding.
 *
 * @inline
 * @category Theming
 */
export type ProtectedColorKey = (typeof PROTECTED_COLORS)[number];

export type ColorPalette = Partial<Record<MetabaseColorKey, string>>;
export type ColorName = MetabaseColorKey;

export type * from "./color-keys";

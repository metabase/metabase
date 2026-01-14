export type { MetabaseThemeV2, ChartColorV2 } from "./theme";
import type { PROTECTED_COLORS } from "../constants/protected-colors";

import type { MetabaseColorKey } from "./color-keys";

// Backward-compatible aliases
export type ColorPalette = Partial<Record<MetabaseColorKey, string>>;
export type ColorName = MetabaseColorKey;

export interface AccentColorOptions {
  main?: boolean;
  light?: boolean;
  dark?: boolean;
  harmony?: boolean;
  gray?: boolean;
}

export type ProtectedColorKey = (typeof PROTECTED_COLORS)[number];

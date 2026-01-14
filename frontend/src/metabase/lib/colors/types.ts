import type { colorConfig } from "./colors";
import type { MetabaseColorV2 } from "./constants";

export type ColorPalette = Partial<Record<keyof typeof colorConfig, string>>;

export type ColorName = keyof typeof colorConfig;

export interface AccentColorOptions {
  main?: boolean;
  light?: boolean;
  dark?: boolean;
  harmony?: boolean;
  gray?: boolean;
}

// V2 Theme Types

// Base V2 theme interface
export interface MetabaseThemeV2 {
  version: 2;
  colors: Record<MetabaseColorV2, string>;
  chartColors?: ChartColorV2[];
}

// Chart color type - same structure as V1
export type ChartColorV2 =
  | string
  | {
      base: string;
      tint?: string;
      shade?: string;
    };

/**
 * User-provided theme overrides. Colors are partial since users only
 * need to specify the colors they want to change.
 */
export interface UserThemeOverride {
  version?: 2;
  colors?: Partial<Record<string, string>>;
  chartColors?: ChartColorV2[];
}

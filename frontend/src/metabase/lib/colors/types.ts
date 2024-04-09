import type { colors } from "./palette";

export type ColorPalette = Partial<Record<keyof typeof colors, string>>;

export type ColorName = keyof ColorPalette;

export interface AccentColorOptions {
  main?: boolean;
  light?: boolean;
  dark?: boolean;
  harmony?: boolean;
}

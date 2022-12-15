import { colors } from "./palette";

export type ColorPalette = Partial<Record<keyof typeof colors, string>>;

export interface AccentColorOptions {
  main?: boolean;
  light?: boolean;
  dark?: boolean;
  harmony?: boolean;
}

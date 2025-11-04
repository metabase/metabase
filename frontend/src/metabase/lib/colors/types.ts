import type { colorConfig } from "./colors";

export type ColorPalette = Partial<Record<keyof typeof colorConfig, string>>;

export type ColorName = keyof typeof colorConfig;

export interface AccentColorOptions {
  main?: boolean;
  light?: boolean;
  dark?: boolean;
  harmony?: boolean;
  gray?: boolean;
}

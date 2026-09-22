import type { MetabaseAccentColorKey } from "./color-keys";

export interface AccentColorOptions {
  main?: boolean;
  light?: boolean;
  dark?: boolean;
  harmony?: boolean;
  gray?: boolean;
}

/**
 * A palette color together with the name it is known by, so that a picked
 * color can be stored as a reference to the palette rather than a fixed value.
 */
export interface NamedColor {
  name: MetabaseAccentColorKey;
  value: string;
}

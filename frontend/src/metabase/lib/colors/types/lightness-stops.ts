import type { CssColor } from "@adobe/leonardo-contrast-colors";

/**
 * Available lightness stop values.
 * 5 is the lightest (almost white), 110 is the darkest (almost black).
 */
export type LightnessStop =
  | 5
  | 10
  | 20
  | 30
  | 40
  | 50
  | 60
  | 70
  | 80
  | 90
  | 100
  | 110;

/**
 * A map of lightness stop values to CSS colors.
 */
export type ColorStops = {
  [K in LightnessStop]: CssColor;
};

/**
 * Alpha color stops map. Same structure as ColorStops but with alpha values.
 */
export type AlphaColorStops = {
  [K in LightnessStop]?: CssColor;
};

/**
 * Result of generating lightness stops for a single color.
 */
export interface GeneratedColorStops {
  /** The solid color stops from lightest (5) to darkest (110) */
  solid: ColorStops;

  /** The detected lightness step of the original color (5-110) */
  detectedStep: LightnessStop;
}

/**
 * Result of generating text color stops.
 * Just alpha variations for text-primary and contrasting (inverse) colors.
 */
export interface GeneratedTextStops {
  /** Alpha stops: text-primary color with varying alpha */
  alpha: AlphaColorStops;

  /** Contrasting alpha stops: white/black with varying alpha for inverse text */
  contrastingAlpha: AlphaColorStops;
}

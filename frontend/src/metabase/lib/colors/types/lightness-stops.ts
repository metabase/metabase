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
 * Input colors for generating lightness stops.
 *
 * Customers can provide just these main colors:
 * - brand: The primary brand color (thru appearance settings and modular embedding theming)
 * - background-primary: The main background color
 * - text-primary: The main text color
 */
export interface LightnessStopInputColors {
  brand?: string;
  "background-primary"?: string;
  "text-primary"?: string;
}

/**
 * Result of generating lightness stops for a single color.
 */
export interface GeneratedColorStops {
  /** The solid color stops from lightest (5) to darkest (110) */
  solid: ColorStops;

  /** Alpha stops based on the original color's lightness level */
  alpha: AlphaColorStops;

  /** Inverse alpha stops (high alpha at light steps, low at dark) */
  alphaInverse: AlphaColorStops;

  /** The detected lightness step of the original color (5-110) */
  detectedStep: LightnessStop;
}

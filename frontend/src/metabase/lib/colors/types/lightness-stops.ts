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

  /** Alpha stops based on the original color's lightness level */
  alpha: AlphaColorStops;

  /** Inverse alpha stops (high alpha at light steps, low at dark) */
  alphaInverse: AlphaColorStops;

  /**
   * Alpha stops from a contrasting base color.
   * If input is dark, uses white. If input is light, uses dark.
   * Used for inverse text colors.
   */
  contrastingAlpha: AlphaColorStops;

  /** The detected lightness step of the original color (5-110) */
  detectedStep: LightnessStop;
}

/**
 * A step derivation can be:
 * - Assign a fixed step number (5, 10, 20, ... 110)
 * - Use a relative offset from the detected step (e.g. offset: -2)
 */
export type StepDerivation = LightnessStop | { offset: number };

/**
 * Alpha derivation uses alpha or alphaInverse stops
 */
export type AlphaDerivation =
  | { alpha: LightnessStop }
  | { alphaInverse: LightnessStop };

export type Derivation = StepDerivation | AlphaDerivation;

/**
 * Conditional derivation based on theme and brand lightness
 */
export interface ConditionalDerivation {
  darkTheme?: {
    darkBrand?: Derivation; // brand step >= 50
    lightBrand?: Derivation; // brand step < 50
    default?: Derivation; // fallback if no brand condition
  };

  lightTheme?: {
    darkBrand?: Derivation;
    lightBrand?: Derivation;
    default?: Derivation;
  };

  // Simple case: same for both themes
  default?: Derivation;
}

export type DerivationRule = Derivation | ConditionalDerivation;

/**
 * Brand derivation rule that supports a shorthand for theme-opposite offsets.
 *
 * A number means: darkTheme uses the number as offset, lightTheme uses negative.
 * Example: 2 means darkTheme: { offset: 2 }, lightTheme: { offset: -2 }
 */
export type BrandDerivationRule = number | DerivationRule;

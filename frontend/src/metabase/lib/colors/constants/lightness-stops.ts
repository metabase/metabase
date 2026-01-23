import type { MetabaseColorKey } from "../types";
import type { LightnessStop } from "../types/lightness-stops";

/**
 * A step derivation can be:
 * - Assign a fixed step number (5, 10, 20, ... 110)
 * - Use a relative offset from the detected step (e.g. offset: -2)
 * - A special accessor function name
 */
export type StepDerivation =
  | LightnessStop
  | { offset: number }
  | { accessor: "accessibleText" }
  | { accessor: "accessibleText"; offsetFromResult: number }
  | { accessor: "accessibleBackground" };

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

// =============================================================================
// Constants
// =============================================================================

// Default colors from light theme (used for dark mode detection when colors aren't provided)
// eslint-disable-next-line no-color-literals
export const DEFAULT_LIGHT_BACKGROUND = "#ffffff";
// eslint-disable-next-line no-color-literals
export const DEFAULT_LIGHT_TEXT = "#303030";

// =============================================================================
// Derivation Maps
// =============================================================================

/**
 * Background color derivations from background-primary
 */
export const BACKGROUND_DERIVATIONS: Record<
  MetabaseColorKey,
  { light: Derivation; dark: Derivation }
> = {
  "background-secondary": { light: 5, dark: 110 },
  "background-tertiary": { light: 10, dark: 80 },
  "background-primary-inverse": { light: 80, dark: 20 },
  "background-secondary-inverse": { light: 70, dark: 30 },
  "background-tertiary-inverse": { light: 40, dark: 70 },
  border: { light: 20, dark: 20 }, // dark mode border comes from text
  "tooltip-background": { light: 80, dark: 70 },
} as Record<MetabaseColorKey, { light: Derivation; dark: Derivation }>;

/**
 * Text color derivations from text-primary
 */
export const TEXT_DERIVATIONS: Record<
  MetabaseColorKey,
  { darkText: Derivation; lightText: Derivation }
> = {
  "text-secondary": { darkText: { alpha: 60 }, lightText: 20 },
  "text-tertiary": { darkText: { alpha: 40 }, lightText: 30 },
  "text-primary-inverse": { darkText: { alphaInverse: 80 }, lightText: 80 },
  "text-secondary-inverse": { darkText: { alphaInverse: 60 }, lightText: 60 },
  "text-tertiary-inverse": { darkText: { alphaInverse: 40 }, lightText: 40 },
  border: { darkText: 20, lightText: { alpha: 20 } }, // only for dark theme
} as Record<MetabaseColorKey, { darkText: Derivation; lightText: Derivation }>;

/**
 * Brand color derivations
 */
export const BRAND_DERIVATIONS: Record<MetabaseColorKey, DerivationRule> = {
  // brand-light/lighter: fixed steps in dark theme, relative in light theme
  "brand-light": {
    darkTheme: { default: 80 },
    lightTheme: { default: { offset: -2 } },
  },
  "brand-lighter": {
    darkTheme: { default: 90 },
    lightTheme: { default: { offset: -3 } },
  },

  // brand-dark/darker: opposite direction based on theme
  "brand-dark": {
    darkTheme: { default: { offset: -1 } },
    lightTheme: { default: { offset: 1 } },
  },
  "brand-darker": {
    darkTheme: { default: { offset: -2 } },
    lightTheme: { default: { offset: 2 } },
  },

  // text-brand: needs good contrast on both backgrounds and brand surfaces
  "text-brand": {
    darkTheme: {
      darkBrand: { offset: -4 }, // much lighter for visibility
      lightBrand: { offset: 0 },
    },
    lightTheme: {
      darkBrand: { offset: -3 }, // lighter to work on brand backgrounds
      lightBrand: { accessor: "accessibleText" },
    },
  },

  // text-hover: slightly different from text-brand
  "text-hover": {
    darkTheme: {
      darkBrand: { offset: -3 },
      lightBrand: { offset: -1 },
    },
    lightTheme: {
      darkBrand: { offset: -2 },
      lightBrand: { accessor: "accessibleText", offsetFromResult: 1 },
    },
  },

  // background-brand: needs contrast with text on top
  "background-brand": {
    darkTheme: { default: { offset: 3 } },
    lightTheme: { default: { accessor: "accessibleBackground" } },
  },

  // focus: subtle tint, same direction as brand-light
  focus: {
    darkTheme: { default: { offset: 2 } },
    lightTheme: { default: { offset: -2 } },
  },

  // text-primary-inverse: on brand-colored buttons
  // Note: This is handled specially in deriveColorsFromInputs based on brand lightness
  "text-primary-inverse": {
    default: 5,
  },
} as Record<MetabaseColorKey, DerivationRule>;

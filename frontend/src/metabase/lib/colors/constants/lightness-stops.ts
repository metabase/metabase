import type { MetabaseColorKey } from "../types";
import type { Derivation, DerivationRule } from "../types/lightness-stops";

/**
 * Background color derivations from background-primary
 */
export const BACKGROUND_DERIVATIONS: Record<
  MetabaseColorKey,
  { light: Derivation; dark: Derivation }
> = {
  "background-secondary": { light: { offset: -1 }, dark: { offset: 1 } },
  "background-tertiary": { light: { offset: -2 }, dark: { offset: 2 } },
  "background-primary-inverse": { light: { offset: 8 }, dark: { offset: -8 } },
  "background-secondary-inverse": {
    light: { offset: 7 },
    dark: { offset: -7 },
  },
  "background-tertiary-inverse": { light: { offset: 4 }, dark: { offset: -4 } },
  border: { light: { offset: 2 }, dark: { offset: -2 } },
  "tooltip-background": { light: { offset: 3 }, dark: { offset: -3 } },
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
  // brand-light/lighter: opposite direction based on theme
  "brand-light": {
    darkTheme: { default: { offset: 2 } },
    lightTheme: { default: { offset: -2 } },
  },
  "brand-lighter": {
    darkTheme: { default: { offset: 3 } },
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
      default: { offset: -1 },
    },
    lightTheme: {
      default: { offset: 1 },
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
      lightBrand: { offset: 5 }, // slightly darker than text-brand
    },
  },

  // background-brand: needs contrast with text on top
  "background-brand": {
    darkTheme: { default: { offset: 3 } },
    lightTheme: { default: { offset: 4 } }, // go darker to support white text
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

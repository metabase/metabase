import type { MetabaseColorKey } from "../types";
import type { BrandDerivationRule } from "../types/lightness-stops";

/**
 * Background color derivations from background-primary.
 *
 * The number represents the dark mode offset. Light mode uses the negative.
 * Example: 1 means light: -1, dark: 1
 */
export const BACKGROUND_DERIVATIONS: Record<MetabaseColorKey, number> = {
  // background-primary is defined by the user.
  "background-secondary": 1,
  "background-tertiary": 2,
  "background-primary-inverse": -8,
  "background-secondary-inverse": -7,
  "background-tertiary-inverse": -4,
  border: -2,
  "tooltip-background": -8,
} as Record<MetabaseColorKey, number>;

/**
 * Text color derivations from text-primary.
 *
 * The number represents the alpha step. The sign indicates direction:
 * - Positive N: light theme uses alpha[N], dark theme uses alphaInverse[N]
 * - Negative -N: light theme uses alphaInverse[N], dark theme uses alpha[N]
 */
export const TEXT_DERIVATIONS: Record<MetabaseColorKey, number> = {
  // text-primary is defined by the user.
  "text-secondary": 60,
  "text-tertiary": 40,
  "text-primary-inverse": -80,
  "text-secondary-inverse": -60,
  "text-tertiary-inverse": -40,
  border: -30,
} as Record<MetabaseColorKey, number>;

/**
 * Brand color derivations.
 *
 * A number means theme-opposite offset: darkTheme uses the number, lightTheme uses negative.
 * Example: 2 means darkTheme: { offset: 2 }, lightTheme: { offset: -2 }
 */
export const BRAND_DERIVATIONS: Record<MetabaseColorKey, BrandDerivationRule> =
  {
    // brand-light/lighter: lighter in dark theme, darker in light theme
    "brand-light": 2,
    "brand-lighter": 3,

    // brand-dark/darker: darker in dark theme, lighter in light theme
    "brand-dark": -1,
    "brand-darker": -2,

    // text-brand: needs good contrast on both backgrounds and brand surfaces
    "text-brand": -1,

    // text-hover: has brand-lightness-specific rules (non-symmetric)
    "text-hover": {
      darkTheme: {
        darkBrand: { offset: -3 },
        lightBrand: { offset: -1 },
      },
      lightTheme: {
        darkBrand: { offset: -2 },
        lightBrand: { offset: 5 },
      },
    },

    // background-brand: asymmetric (dark: 3, light: 4)
    "background-brand": {
      darkTheme: { default: { offset: 3 } },
      lightTheme: { default: { offset: 4 } },
    },

    // focus: subtle tint, same direction as brand-light
    focus: 2,

    // text-primary-inverse: handled specially based on brand lightness
    "text-primary-inverse": {
      default: 5,
    },
  } as Record<MetabaseColorKey, BrandDerivationRule>;

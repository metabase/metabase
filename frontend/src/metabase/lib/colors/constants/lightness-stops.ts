import type { MetabaseColorKey } from "../types";
import type { BrandDerivationRule } from "../types/lightness-stops";

/**
 * Background color offsets from background-primary.
 *
 * The number represents the offset light mode.
 * Dark mode is the inverse of this.
 * Example: 1 = (light: offset by 1 step, dark: offset by -1 step)
 */
export const BACKGROUND_DERIVE_OFFSETS: Record<MetabaseColorKey, number> = {
  // background-primary is defined by the user.
  "background-secondary": -1,
  "background-tertiary": 2,
  "background-primary-inverse": 8,
  "background-secondary-inverse": 7,
  "background-tertiary-inverse": 4,
  border: 2,
} as Record<MetabaseColorKey, number>;

/**
 * Text color alpha steps from text-primary.
 *
 * The number represents the alpha step. The sign indicates source:
 * - Positive N: uses alpha[N] from text-primary (for regular text)
 * - Negative -N: uses contrastingAlpha[N] (for inverse text)
 */
export const TEXT_DERIVE_ALPHA_STEPS: Record<MetabaseColorKey, number> = {
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
    "brand-light": 5,
    "brand-lighter": 6,

    // brand-dark/darker: darker in dark theme, lighter in light theme
    "brand-dark": -2,
    "brand-darker": -3,

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

    "background-brand": 2,
    focus: 3,
  } as Record<MetabaseColorKey, BrandDerivationRule>;

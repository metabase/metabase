import type { MetabaseColorKey } from "../types";

/**
 * Background color offsets from background-primary.
 *
 * The number represents the offset light mode.
 * Dark mode is the inverse of this.
 * Example: 1 = (light: offset by 1 step, dark: offset by -1 step)
 */
export const BACKGROUND_DERIVE_OFFSETS = {
  // background-primary is defined by the user.
  "background-secondary": -1,
  "background-tertiary": 2,
  "background-primary-inverse": 8,
  "background-secondary-inverse": 7,
  "background-tertiary-inverse": 4,
} satisfies Partial<Record<MetabaseColorKey, number>>;

/**
 * Text color alpha steps from text-primary.
 *
 * The number represents the alpha step. The sign indicates source:
 * - Positive N: uses alpha[N] from text-primary (for regular text)
 * - Negative -N: uses contrastingAlpha[N] (for inverse text)
 */
export const TEXT_DERIVE_ALPHA_STEPS = {
  // text-primary is defined by the user.
  "text-secondary": 60,
  "text-tertiary": 40,
  "text-primary-inverse": -80,
  "text-secondary-inverse": -60,
  "text-tertiary-inverse": -40,
  border: 20,
} satisfies Partial<Record<MetabaseColorKey, number>>;

/**
 * Brand color derivations.
 */
export const BRAND_DERIVE_OFFSETS = {
  "brand-light": 5,
  "brand-lighter": 6,
  "brand-dark": -2,
  "brand-darker": -3,
  "text-brand": -1,
  "text-hover": -1,
  "background-brand": 2,
  focus: 3,
} satisfies Partial<Record<MetabaseColorKey, number>>;

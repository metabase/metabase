import {
  BACKGROUND_DERIVE_OFFSETS,
  BRAND_DERIVE_OFFSETS,
  TEXT_DERIVE_ALPHA_STEPS,
} from "../constants/lightness-stops";
import type { MetabaseColorKey } from "../types";

import {
  detectLightnessStep,
  generateLightnessStops,
  generateTextStops,
  getRelativeStep,
} from "./lightness-stops";

type DeriveInputColor = "background-primary" | "text-primary" | "brand";

/**
 * Detects whether the theme is dark based on background and text colors.
 */
const detectIsDarkTheme = (
  backgroundPrimary: string,
  textPrimary: string,
): boolean =>
  detectLightnessStep(backgroundPrimary) > detectLightnessStep(textPrimary);

/**
 * Derives additional color keys from the 3 main input colors:
 * - brand
 * - background-primary
 * - text-primary
 *
 * This allows customers to set just these 3 colors and have a complete
 * theme derived automatically using lightness stops.
 *
 * Dark/light theme is auto-detected from background-primary and text-primary.
 */
export function deriveColorsFromInputs(
  colors: Record<DeriveInputColor, string>,
): Partial<Record<MetabaseColorKey, string>> {
  if (!colors) {
    return {};
  }

  const derived: Partial<Record<MetabaseColorKey, string>> = {};

  // Derive background-related colors from background-primary
  if (colors["background-primary"]) {
    const bgStops = generateLightnessStops(colors["background-primary"]);
    const isLightBackground = bgStops.detectedStep <= 20;

    for (const [key, lightOffset] of Object.entries(
      BACKGROUND_DERIVE_OFFSETS,
    )) {
      // Light mode uses offset directly, dark mode uses negative
      const offset = isLightBackground ? lightOffset : -lightOffset;
      const step = getRelativeStep(bgStops.detectedStep, offset);
      derived[key as MetabaseColorKey] = bgStops.solid[step];
    }

    // Remove border if dark background (will be derived from text-primary)
    if (!isLightBackground) {
      delete derived["border"];
    }
  }

  // Derive text-related colors from text-primary
  if (colors["text-primary"]) {
    const textStops = generateTextStops(colors["text-primary"]);
    const isLightTheme = detectLightnessStep(colors["text-primary"]) >= 60; // dark text = light theme

    for (const [key, alphaStep] of Object.entries(TEXT_DERIVE_ALPHA_STEPS)) {
      // Skip border for light theme (already set from background)
      if (key === "border" && isLightTheme) {
        continue;
      }

      // Positive: uses alpha from text-primary (for regular text colors)
      // Negative: uses contrastingAlpha (for inverse text colors)
      const step = Math.abs(alphaStep) as keyof typeof textStops.alpha;
      const useContrastingAlpha = alphaStep < 0;

      const color = useContrastingAlpha
        ? textStops.contrastingAlpha[step]
        : textStops.alpha[step];

      if (color) {
        derived[key as MetabaseColorKey] = color;
      }
    }
  }

  // Derive brand-related colors from brand
  if (colors["brand"]) {
    const brandStops = generateLightnessStops(colors["brand"]);

    const isDarkTheme = detectIsDarkTheme(
      colors["background-primary"],
      colors["text-primary"],
    );

    for (const [colorKey, lightOffset] of Object.entries(
      BRAND_DERIVE_OFFSETS,
    )) {
      // Dark theme uses offset directly, light theme uses negative
      const offset = isDarkTheme ? lightOffset : -lightOffset;
      const step = getRelativeStep(brandStops.detectedStep, offset);
      derived[colorKey as MetabaseColorKey] = brandStops.solid[step];
    }
  }

  return derived;
}

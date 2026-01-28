import {
  BACKGROUND_DERIVE_OFFSETS,
  BRAND_DERIVE_OFFSETS,
  TEXT_DERIVE_ALPHA_STEPS,
} from "../constants/lightness-stops";
import type { MetabaseColorKey } from "../types";
import type { GeneratedColorStops } from "../types/lightness-stops";

import {
  generateLightnessStops,
  generateTextStops,
  getRelativeStep,
} from "./lightness-stops";

type DeriveInputColor = "background-primary" | "text-primary" | "brand";

/**
 * Derives additional color keys from the 3 main input colors:
 * - brand
 * - background-primary
 * - text-primary
 *
 * This allows customers to set just these 3 colors and have a complete
 * theme derived automatically using lightness stops.
 */
export function deriveColorsFromInputs(
  colors: Record<DeriveInputColor, string>,
): Partial<Record<MetabaseColorKey, string>> {
  if (!colors) {
    return {};
  }

  let derived: Partial<Record<MetabaseColorKey, string>> = {};

  // Detect theme from background-primary (light bg = light theme)
  const bgStops = colors["background-primary"]
    ? generateLightnessStops(colors["background-primary"])
    : null;
  const isLightTheme = bgStops ? bgStops.detectedStep <= 20 : true;

  // Derive background-related colors
  if (bgStops) {
    derived = {
      ...derived,
      ...deriveFromOffsets(bgStops, BACKGROUND_DERIVE_OFFSETS, isLightTheme),
    };
  }

  // Derive text-related colors from text-primary
  if (colors["text-primary"]) {
    const textStops = generateTextStops(colors["text-primary"]);

    for (const [key, alphaStep] of Object.entries(TEXT_DERIVE_ALPHA_STEPS)) {
      const step = Math.abs(alphaStep) as keyof typeof textStops.alpha;

      let color: string | undefined;

      if (key === "border") {
        // Border always uses alpha from text-primary (works for both themes)
        color = textStops.alpha[step];
      } else {
        // Other colors: positive = alpha, negative = contrastingAlpha
        const useContrastingAlpha = alphaStep < 0;
        color = useContrastingAlpha
          ? textStops.contrastingAlpha[step]
          : textStops.alpha[step];
      }

      if (color) {
        derived[key as MetabaseColorKey] = color;
      }
    }
  }

  // Derive brand-related colors from brand
  if (colors["brand"]) {
    const brandStops = generateLightnessStops(colors["brand"]);
    derived = {
      ...derived,
      ...deriveFromOffsets(brandStops, BRAND_DERIVE_OFFSETS, !isLightTheme),
    };
  }

  return derived;
}

/**
 * Derives colors from lightness stops using offsets.
 * When usePositiveOffset is true, uses the offset as-is; otherwise negates it.
 */
function deriveFromOffsets(
  stops: GeneratedColorStops,
  offsets: Record<string, number>,
  usePositiveOffset: boolean,
): Partial<Record<MetabaseColorKey, string>> {
  const derived: Partial<Record<MetabaseColorKey, string>> = {};

  for (const [key, baseOffset] of Object.entries(offsets)) {
    const offset = usePositiveOffset ? baseOffset : -baseOffset;
    const step = getRelativeStep(stops.detectedStep, offset);
    derived[key as MetabaseColorKey] = stops.solid[step];
  }

  return derived;
}

import {
  BACKGROUND_DERIVATIONS,
  BRAND_DERIVATIONS,
  DEFAULT_LIGHT_BACKGROUND,
  DEFAULT_LIGHT_TEXT,
  TEXT_DERIVATIONS,
} from "../constants/lightness-stops";
import type { MetabaseColorKey } from "../types";

import { detectLightnessStep, generateLightnessStops } from "./lightness-stops";
import {
  resolveConditionalDerivation,
  resolveDerivation,
} from "./lightness-stops-resolver";

type DeriveInputColor = "background-primary" | "text-primary" | "brand";

/**
 * Detects whether the theme is dark based on background and text colors.
 */
function detectIsDarkTheme(
  backgroundPrimary: string | undefined,
  textPrimary: string | undefined,
): boolean {
  const bgColor = backgroundPrimary ?? DEFAULT_LIGHT_BACKGROUND;
  const textColor = textPrimary ?? DEFAULT_LIGHT_TEXT;

  const bgStep = detectLightnessStep(bgColor);
  const textStep = detectLightnessStep(textColor);

  return bgStep > textStep;
}

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
  colors: Partial<Record<DeriveInputColor, string>> | null | undefined,
): Partial<Record<MetabaseColorKey, string>> {
  if (!colors) {
    return {};
  }

  const derived: Partial<Record<MetabaseColorKey, string>> = {};

  // Derive background-related colors from background-primary
  if (colors["background-primary"]) {
    const bgStops = generateLightnessStops(colors["background-primary"]);
    const isLightBackground = bgStops.detectedStep <= 20;

    for (const [key, rule] of Object.entries(BACKGROUND_DERIVATIONS)) {
      const derivation = isLightBackground ? rule.light : rule.dark;
      derived[key as MetabaseColorKey] = resolveDerivation(derivation, bgStops);
    }

    // Remove border if dark background (will be derived from text-primary)
    if (!isLightBackground) {
      delete derived["border"];
    }
  }

  // Derive text-related colors from text-primary
  if (colors["text-primary"]) {
    const textStops = generateLightnessStops(colors["text-primary"]);
    const isDarkText = textStops.detectedStep >= 60;

    for (const [key, rule] of Object.entries(TEXT_DERIVATIONS)) {
      // Skip border for light theme (already set from background)
      if (key === "border" && isDarkText) {
        continue;
      }

      const derivation = isDarkText ? rule.darkText : rule.lightText;
      derived[key as MetabaseColorKey] = resolveDerivation(
        derivation,
        textStops,
      );
    }
  }

  // Derive brand-related colors from brand
  if (colors["brand"]) {
    const brandStops = generateLightnessStops(colors["brand"]);
    const detectedStep = brandStops.detectedStep;
    const isDarkTheme = detectIsDarkTheme(
      colors["background-primary"],
      colors["text-primary"],
    );
    const brandIsDark = detectedStep >= 50;

    for (const [key, rule] of Object.entries(BRAND_DERIVATIONS)) {
      // Special handling for text-primary-inverse (based on brand lightness, not theme)
      if (key === "text-primary-inverse") {
        const brandIsLight = detectedStep <= 40;
        derived[key as MetabaseColorKey] = brandIsLight
          ? brandStops.solid[100] // Light brand needs dark text
          : brandStops.solid[5]; // Dark brand needs light text
        continue;
      }

      const result = resolveConditionalDerivation(
        rule,
        brandStops,
        isDarkTheme,
        brandIsDark,
      );
      if (result) {
        derived[key as MetabaseColorKey] = result;
      }
    }
  }

  return derived;
}

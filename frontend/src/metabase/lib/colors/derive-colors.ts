import {
  detectLightnessStep,
  generateLightnessStops,
  getAccessibleBackgroundStep,
  getAccessibleTextStep,
  getRelativeStep,
} from "./lightness-stops";
import type { MetabaseColorKey } from "./types";

type DeriveInputColor = "background-primary" | "text-primary" | "brand";

// Default colors from light theme (used for dark mode detection when colors aren't provided)
// eslint-disable-next-line no-color-literals
const DEFAULT_LIGHT_BACKGROUND = "#ffffff";
// eslint-disable-next-line no-color-literals
const DEFAULT_LIGHT_TEXT = "#303030";

/**
 * Detects whether the theme is dark based on background and text colors.
 *
 * Dark theme characteristics:
 * - Background is dark (high lightness step, e.g., 80-110)
 * - Text is light (low lightness step, e.g., 5-30)
 *
 * Light theme characteristics:
 * - Background is light (low lightness step, e.g., 5-20)
 * - Text is dark (high lightness step, e.g., 60-110)
 *
 * @returns true if the theme appears to be dark
 */
function detectIsDarkTheme(
  backgroundPrimary: string | undefined,
  textPrimary: string | undefined,
): boolean {
  const bgColor = backgroundPrimary ?? DEFAULT_LIGHT_BACKGROUND;
  const textColor = textPrimary ?? DEFAULT_LIGHT_TEXT;

  const bgStep = detectLightnessStep(bgColor);
  const textStep = detectLightnessStep(textColor);

  // Dark theme: background step > text step (dark bg, light text)
  // Light theme: background step < text step (light bg, dark text)
  // Use a threshold to handle edge cases
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

    // For a light background (detected step <= 20), use lighter stops for secondary
    // For a dark background, use darker stops
    const isLightBackground = bgStops.detectedStep <= 20;

    if (isLightBackground) {
      // Light theme derivations (background is light, like white)
      derived["background-secondary"] = bgStops.solid[5];
      derived["background-tertiary"] = bgStops.solid[10];
      derived["background-primary-inverse"] = bgStops.solid[80];
      derived["background-secondary-inverse"] = bgStops.solid[70];
      derived["background-tertiary-inverse"] = bgStops.solid[40];
      derived["border"] = bgStops.solid[20];
      derived["tooltip-background"] = bgStops.solid[80];
    } else {
      // Dark theme derivations (background is dark)
      derived["background-secondary"] = bgStops.solid[110];
      derived["background-tertiary"] = bgStops.solid[80];
      derived["background-primary-inverse"] = bgStops.solid[20];
      derived["background-secondary-inverse"] = bgStops.solid[30];
      derived["background-tertiary-inverse"] = bgStops.solid[70];
      // Border for dark mode is derived from text-primary below
      derived["tooltip-background"] = bgStops.solid[70];
    }
  }

  // Derive text-related colors from text-primary
  if (colors["text-primary"]) {
    const textStops = generateLightnessStops(colors["text-primary"]);

    // Text is typically dark on light backgrounds, light on dark backgrounds
    const isDarkText = textStops.detectedStep >= 60;

    if (isDarkText) {
      // Dark text on light background (light theme)
      derived["text-secondary"] = textStops.alpha[60];
      derived["text-tertiary"] = textStops.alpha[40];
      derived["text-primary-inverse"] = textStops.alphaInverse[80];
      derived["text-secondary-inverse"] = textStops.alphaInverse[60];
      derived["text-tertiary-inverse"] = textStops.alphaInverse[40];
    } else {
      // Light text on dark background (dark theme)
      // Use solid lighter steps for text-secondary/tertiary for reliable contrast
      // Alpha values on light text don't provide enough contrast on dark backgrounds
      derived["text-secondary"] = textStops.solid[20]; // Light gray, solid
      derived["text-tertiary"] = textStops.solid[30]; // Slightly darker
      derived["text-primary-inverse"] = textStops.alpha[80];
      // Derive border from text-primary (light color) with low alpha
      // This gives a subtle light border visible against dark backgrounds
      derived["border"] = textStops.alpha[20];
      derived["text-secondary-inverse"] = textStops.alpha[60];
      derived["text-tertiary-inverse"] = textStops.alpha[40];
    }
  }

  // Derive brand-related colors from brand
  // Uses relative offsets from the detected step to ensure perceivable differences
  // regardless of whether the brand color is light or dark
  if (colors["brand"]) {
    const brandStops = generateLightnessStops(colors["brand"]);
    const detectedStep = brandStops.detectedStep;
    const isDarkTheme = detectIsDarkTheme(
      colors["background-primary"],
      colors["text-primary"],
    );

    // In light theme: brand-light goes lighter (negative offset)
    // In dark theme: brand-light goes darker (positive offset) for contrast with dark bg
    // This mirrors Metabase's built-in themes where dark mode uses steps 80/90 for brand-light
    const lightDirection = isDarkTheme ? 1 : -1;

    if (isDarkTheme) {
      // In dark mode, brand-light/lighter are SUBTLE dark backgrounds (like steps 80/90)
      // They should be much darker than the brand color to blend with dark UI
      // This matches the built-in dark theme: brand-light=80, brand-lighter=90
      // Use fixed high steps for consistency regardless of brand color lightness
      derived["brand-light"] = brandStops.solid[80];
      derived["brand-lighter"] = brandStops.solid[90];
    } else {
      // In light mode, brand-light/lighter are subtle tints (lighter than brand)
      derived["brand-light"] =
        brandStops.solid[getRelativeStep(detectedStep, -2)];
      derived["brand-lighter"] =
        brandStops.solid[getRelativeStep(detectedStep, -3)];
    }

    // Dark variants: opposite direction of light variants
    const darkDirection = isDarkTheme ? -1 : 1;

    derived["brand-dark"] =
      brandStops.solid[getRelativeStep(detectedStep, darkDirection * 1)];
    derived["brand-darker"] =
      brandStops.solid[getRelativeStep(detectedStep, darkDirection * 2)];

    // Text colors: ensure WCAG AA contrast (4.5:1) against the theme's background
    // Light theme: check against white background (need darker text)
    // Dark theme: check against dark background (need lighter text)
    if (isDarkTheme) {
      // For dark theme, text-brand should be light (like step 40) for contrast
      // This matches built-in dark theme: text-brand=40, text-hover=30
      derived["text-brand"] =
        brandStops.solid[getRelativeStep(detectedStep, 0)]; // Use detected or lighter
      derived["text-hover"] =
        brandStops.solid[getRelativeStep(detectedStep, -1)]; // One step lighter
    } else {
      // For light theme, text-brand needs contrast against white
      const accessibleTextStep = getAccessibleTextStep(brandStops);
      derived["text-brand"] = brandStops.solid[accessibleTextStep];
      derived["text-hover"] =
        brandStops.solid[getRelativeStep(accessibleTextStep, 1)];
    }

    // Background-brand: needs sufficient contrast with text on top
    // Light theme: white text on brand bg (need darker bg)
    // Dark theme: use a medium step that contrasts with dark background
    if (isDarkTheme) {
      // Dark theme: background-brand should contrast with dark background
      derived["background-brand"] =
        brandStops.solid[getRelativeStep(detectedStep, 3)];
    } else {
      // Light theme: background-brand needs contrast with white text
      const accessibleBgStep = getAccessibleBackgroundStep(brandStops);
      derived["background-brand"] = brandStops.solid[accessibleBgStep];
    }

    // Focus: subtle tint relative to detected step (same direction as brand-light)
    derived["focus"] =
      brandStops.solid[getRelativeStep(detectedStep, lightDirection * 2)];
  }

  return derived;
}

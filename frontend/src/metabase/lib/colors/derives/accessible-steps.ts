import { contrast } from "@adobe/leonardo-contrast-colors";
import Color from "color";

import type {
  GeneratedColorStops,
  LightnessStop,
} from "../types/lightness-stops";

import { INDEX_TO_STOP } from "./lightness-stops";

// eslint-disable-next-line no-color-literals
const WHITE = "#ffffff";

/**
 * Find the first lightness step (starting from a given step and going darker)
 * that meets a minimum contrast ratio against a background color.
 *
 * This is useful for ensuring text colors are readable on a given background.
 *
 * @param colorStops - The generated color stops to search through
 * @param backgroundColor - The background color to check contrast against (default: white)
 * @param minContrast - Minimum contrast ratio required (default: 4.5 for WCAG AA)
 * @param startStep - The step to start searching from (default: 50)
 * @returns The first step that meets the contrast requirement, or 110 if none found
 *
 * @example
 * ```ts
 * const stops = generateLightnessStops("#af60ff");
 * const textStep = getAccessibleTextStep(stops);  // Finds step with 4.5:1 contrast
 * ```
 */
export function getAccessibleTextStep(
  colorStops: GeneratedColorStops,
  backgroundColor: string = WHITE,
  minContrast: number = 4.5,
  startStep: LightnessStop = 50,
): LightnessStop {
  const bgRgb = Color(backgroundColor).rgb().array() as [
    number,
    number,
    number,
  ];
  const bgLightness = Color(backgroundColor).lightness();
  const startIndex = INDEX_TO_STOP.indexOf(startStep);

  // Determine search direction based on background lightness (0-100)
  // Dark background (low lightness): search toward lighter steps (lower index)
  // Light background (high lightness): search toward darker steps (higher index)
  const isDarkBg = bgLightness < 50;

  if (isDarkBg) {
    // For dark backgrounds, we want the LIGHTEST step that has enough contrast
    // Start from the lightest (step 5) and find the first with sufficient contrast
    for (let i = 0; i < INDEX_TO_STOP.length; i++) {
      const step = INDEX_TO_STOP[i];
      const colorValue = colorStops.solid[step];
      const colorRgb = Color(colorValue).rgb().array() as [
        number,
        number,
        number,
      ];
      const contrastRatio = contrast(colorRgb, bgRgb);

      if (contrastRatio >= minContrast) {
        return step;
      }
    }
    // If no step meets the requirement, return the lightest
    return 5;
  } else {
    // Search toward darker steps (higher index)
    for (let i = startIndex; i < INDEX_TO_STOP.length; i++) {
      const step = INDEX_TO_STOP[i];
      const colorValue = colorStops.solid[step];
      const colorRgb = Color(colorValue).rgb().array() as [
        number,
        number,
        number,
      ];

      const contrastRatio = contrast(colorRgb, bgRgb);

      if (contrastRatio >= minContrast) {
        return step;
      }
    }

    // If no step meets the requirement, return the darkest
    return 110;
  }
}

/**
 * Find a background color step that has sufficient contrast with white text.
 * Searches from the detected step toward darker steps until contrast is met.
 *
 * This is useful for ensuring background colors can support white text overlays.
 *
 * @param colorStops - The generated color stops to search through
 * @param minContrast - Minimum contrast ratio required (default: 4.5 for WCAG AA)
 * @param startStep - The step to start searching from (default: detected step)
 * @returns The first step that meets the contrast requirement with white
 */
export function getAccessibleBackgroundStep(
  colorStops: GeneratedColorStops,
  minContrast: number = 4.5,
  startStep?: LightnessStop,
): LightnessStop {
  const whiteRgb: [number, number, number] = [255, 255, 255];
  const effectiveStartStep = startStep ?? colorStops.detectedStep;
  const startIndex = INDEX_TO_STOP.indexOf(effectiveStartStep);

  // Search from startStep toward darker steps
  for (let i = startIndex; i < INDEX_TO_STOP.length; i++) {
    const step = INDEX_TO_STOP[i];
    const colorValue = colorStops.solid[step];
    const colorRgb = Color(colorValue).rgb().array() as [
      number,
      number,
      number,
    ];
    const contrastRatio = contrast(whiteRgb, colorRgb);

    if (contrastRatio >= minContrast) {
      return step;
    }
  }

  // If no step meets the requirement, return the darkest
  return 110;
}

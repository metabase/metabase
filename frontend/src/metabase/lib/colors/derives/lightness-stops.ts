import {
  BackgroundColor,
  type ContrastColor,
  type CssColor,
  Color as LeonardoColor,
  Theme,
  contrast,
} from "@adobe/leonardo-contrast-colors";
import Color from "color";

import type {
  AlphaColorStops,
  ColorStops,
  GeneratedColorStops,
  LightnessStop,
} from "../types/lightness-stops";

// Re-export accessible step functions
export {
  getAccessibleBackgroundStep,
  getAccessibleTextStep,
} from "./accessible-steps";

/**
 * Contrast ratios used to generate lightness stops.
 * These are carefully tuned to produce perceptually even steps.
 */
const RATIOS = [
  1.05, 1.1, 1.34, 1.94, 2.86, 3.56, 5.09, 7.86, 11.56, 15.33, 18.16, 19.44,
];

/**
 * Maps contrast ratio indices (0-11) to lightness stop values.
 */
export const INDEX_TO_STOP: LightnessStop[] = [
  5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110,
];

/**
 * Get a lightness step relative to a detected step by an offset.
 * Positive offset = darker, negative offset = lighter.
 *
 * @param detectedStep - The detected lightness step of the original color
 * @param offset - Number of steps to move (negative = lighter, positive = darker)
 * @returns The target lightness step, clamped to valid range
 *
 * @example
 * ```ts
 * getRelativeStep(50, -2)  // Returns 30 (2 steps lighter)
 * getRelativeStep(50, 1)   // Returns 60 (1 step darker)
 * getRelativeStep(10, -2)  // Returns 5 (clamped to lightest)
 * ```
 */
export function getRelativeStep(
  detectedStep: LightnessStop,
  offset: number,
): LightnessStop {
  const currentIndex = INDEX_TO_STOP.indexOf(detectedStep);
  const targetIndex = Math.max(
    0,
    Math.min(INDEX_TO_STOP.length - 1, currentIndex + offset),
  );
  return INDEX_TO_STOP[targetIndex];
}

/**
 * Find the closest lightness step for a given color by comparing its
 * contrast ratio against white to our predefined ratio scale.
 *
 * @param color - A CSS color string
 * @returns The closest lightness stop (5, 10, 20, ... 100, 110)
 */
export function detectLightnessStep(color: string): LightnessStop {
  const rgb = Color(color).rgb().array();
  const contrastRatio = contrast(
    rgb as [number, number, number],
    [255, 255, 255],
  );

  // Find the index of the closest ratio
  let closestIndex = 0;
  let minDiff = Math.abs(RATIOS[0] - contrastRatio);

  for (let i = 1; i < RATIOS.length; i++) {
    const diff = Math.abs(RATIOS[i] - contrastRatio);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }

  return INDEX_TO_STOP[closestIndex];
}

/**
 * Generate alpha color stops for a given color.
 *
 * @param color - The base color to generate alpha stops from
 * @param inverse - If true, generates inverse alpha (high alpha at light steps)
 * @returns A map of lightness stops to alpha-modified colors
 */
function generateAlphaStops(
  color: string,
  inverse: boolean = false,
): AlphaColorStops {
  const c = Color(color);

  const alphaValues = {
    5: 0.02,
    10: 0.05,
    20: 0.17,
    30: 0.29,
    40: 0.44,
    50: 0.51,
    60: 0.62,
    70: 0.74,
    80: 0.84,
    90: 0.93,
    100: 1,
    110: 1,
  };

  const stops: AlphaColorStops = {};

  for (const [stop, alpha] of Object.entries(alphaValues)) {
    const numStop = Number(stop) as LightnessStop;

    const effectiveAlpha = inverse
      ? alphaValues[
          INDEX_TO_STOP[
            INDEX_TO_STOP.length - 1 - INDEX_TO_STOP.indexOf(numStop)
          ] as LightnessStop
        ]
      : alpha;

    stops[numStop] = c.alpha(effectiveAlpha).hexa() as CssColor;
  }

  return stops;
}

/**
 * Generate all 11 lightness stops for a single color using Leonardo.
 *
 * This uses contrast-based color generation to produce perceptually even
 * lightness steps. The original color is detected within the scale, and
 * alpha variations are generated based on that detected position.
 *
 * @param color - A CSS color string (hex, rgb, hsl, etc.)
 * @returns An object containing solid stops, alpha stops, inverse alpha stops,
 *          and the detected step of the original color
 */
export function generateLightnessStops(color: string): GeneratedColorStops {
  const background = new BackgroundColor({
    name: "background",
    // eslint-disable-next-line no-color-literals
    colorKeys: ["#FFF"],
    ratios: RATIOS,
    smooth: false,
    colorspace: "HSL",
  });

  const inputColor = new LeonardoColor({
    name: "input",
    colorKeys: [color as CssColor],
    ratios: RATIOS,
    smooth: false,
    colorspace: "HSL",
  });

  const theme = new Theme({
    colors: [inputColor],
    backgroundColor: background,
    lightness: 100,
    contrast: 1,
    saturation: 100,
    output: "HSL",
  });

  const { contrastColors } = theme;
  const colorResult = contrastColors.find(
    (cc) => (cc as ContrastColor).name === "input",
  ) as ContrastColor;

  if (!colorResult) {
    throw new Error("Failed to generate color stops");
  }

  const { values: contrastColorValues } = colorResult;

  const detectedStep = detectLightnessStep(color);

  // Map the contrast color values to our stop structure
  const solid: ColorStops = {
    5: contrastColorValues[0].value,
    10: contrastColorValues[1].value,
    20: contrastColorValues[2].value,
    30: contrastColorValues[3].value,
    40: contrastColorValues[4].value,
    50: contrastColorValues[5].value,
    60: contrastColorValues[6].value,
    70: contrastColorValues[7].value,
    80: contrastColorValues[8].value,
    90: contrastColorValues[9].value,
    100: contrastColorValues[10].value,
    110: contrastColorValues[11].value,
  };

  // Find the index of the detected step to get the color at that position
  const detectedIndex = INDEX_TO_STOP.indexOf(detectedStep);
  const colorAtDetectedStep = contrastColorValues[detectedIndex].value;

  return {
    solid,
    alpha: generateAlphaStops(colorAtDetectedStep, false),
    alphaInverse: generateAlphaStops(colorAtDetectedStep, true),
    detectedStep,
  };
}

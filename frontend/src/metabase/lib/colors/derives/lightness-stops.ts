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
  GeneratedTextStops,
  LightnessStop,
} from "../types/lightness-stops";

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
 * Generate all 12 lightness stops for a single color using Leonardo.
 *
 * This uses contrast-based color generation to produce perceptually even
 * lightness steps.
 *
 * @param color - A CSS color string (hex, rgb, hsl, etc.)
 * @returns An object containing solid stops and the detected step
 */
export function generateLightnessStops(color: string): GeneratedColorStops {
  const background = new BackgroundColor({
    name: "background",
    // eslint-disable-next-line metabase/no-color-literals
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

  return {
    solid,
    detectedStep: detectLightnessStep(color),
  };
}

/**
 * Alpha values for text colors.
 * Used for dark text on light backgrounds.
 */
const TEXT_ALPHA_VALUES: Record<LightnessStop, number> = {
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

/**
 * Alpha values for inverse text colors.
 * Used for light text on dark backgrounds (e.g., tooltips).
 */
const TEXT_ALPHA_INVERSE_VALUES: Record<LightnessStop, number> = {
  5: 0.01,
  10: 0.1,
  20: 0.21,
  30: 0.33,
  40: 0.46,
  50: 0.53,
  60: 0.69,
  70: 0.85,
  80: 0.95,
  90: 0.98,
  100: 1,
  110: 1,
};

/**
 * Generate text color stops without using Leonardo.
 *
 * This is a simpler approach for text colors:
 * - alpha: the input color with varying alpha (for text-secondary, text-tertiary, etc.)
 * - contrastingAlpha: white or black with varying alpha (for inverse text colors)
 *
 * @param textColor - The text-primary color
 * @returns Alpha stops for text and contrasting (inverse) text
 */
export function generateTextStops(textColor: string): GeneratedTextStops {
  const c = Color(textColor);
  const isDark = c.isDark();

  // Generate alpha stops for the text color itself
  const alpha: AlphaColorStops = {};
  for (const [stop, alphaValue] of Object.entries(TEXT_ALPHA_VALUES)) {
    const numStop = Number(stop) as LightnessStop;
    alpha[numStop] = c.alpha(alphaValue).hexa() as CssColor;
  }

  // Generate contrasting alpha stops (white for dark text, black for light text)
  // eslint-disable-next-line metabase/no-color-literals
  const contrastingBase = Color(isDark ? "#FFFFFF" : "#000000");
  const contrastingAlpha: AlphaColorStops = {};
  for (const [stop, alphaValue] of Object.entries(TEXT_ALPHA_INVERSE_VALUES)) {
    const numStop = Number(stop) as LightnessStop;
    contrastingAlpha[numStop] = contrastingBase
      .alpha(alphaValue)
      .hexa() as CssColor;
  }

  return { alpha, contrastingAlpha };
}

import {
  BackgroundColor,
  Color,
  type ContrastColor,
  type CssColor,
  Theme,
  contrast,
} from "@adobe/leonardo-contrast-colors";
import Color_ from "color";

/**
 * Contrast ratios used to generate lightness stops.
 * These are carefully tuned to produce perceptually even steps.
 */
const RATIOS = [
  1.05, 1.1, 1.34, 1.94, 2.86, 3.56, 5.09, 7.86, 11.56, 15.33, 18.16, 19.44,
];

/**
 * Available lightness stop values.
 * 5 is the lightest (almost white), 110 is the darkest (almost black).
 */
export type LightnessStop =
  | 5
  | 10
  | 20
  | 30
  | 40
  | 50
  | 60
  | 70
  | 80
  | 90
  | 100
  | 110;

/**
 * A map of lightness stop values to CSS colors.
 */
export type ColorStops = {
  [K in LightnessStop]: CssColor;
};

/**
 * Alpha color stops map. Same structure as ColorStops but with alpha values.
 */
export type AlphaColorStops = {
  [K in LightnessStop]?: CssColor;
};

/**
 * Input colors for generating lightness stops.
 * Customers can provide just these main colors:
 * - brand: The primary brand color
 * - background-primary: The main background color
 * - text-primary: The main text color
 */
export interface LightnessStopInputColors {
  brand?: string;
  "background-primary"?: string;
  "text-primary"?: string;
}

/**
 * Result of generating lightness stops for a single color.
 */
export interface GeneratedColorStops {
  /** The solid color stops from lightest (5) to darkest (110) */
  solid: ColorStops;

  /** Alpha stops based on the original color's lightness level */
  alpha: AlphaColorStops;

  /** Inverse alpha stops (high alpha at light steps, low at dark) */
  alphaInverse: AlphaColorStops;

  /** The detected lightness step of the original color (5-110) */
  detectedStep: LightnessStop;
}

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
// eslint-disable-next-line no-color-literals
const WHITE = "#ffffff";

export function getAccessibleTextStep(
  colorStops: GeneratedColorStops,
  backgroundColor: string = WHITE,
  minContrast: number = 4.5,
  startStep: LightnessStop = 50,
): LightnessStop {
  const bgRgb = Color_(backgroundColor).rgb().array() as [
    number,
    number,
    number,
  ];
  const bgLightness = Color_(backgroundColor).lightness();
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
      const colorRgb = Color_(colorValue).rgb().array() as [
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
      const colorRgb = Color_(colorValue).rgb().array() as [
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
    const colorRgb = Color_(colorValue).rgb().array() as [
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

/**
 * Find the closest lightness step for a given color by comparing its
 * contrast ratio against white to our predefined ratio scale.
 *
 * @param color - A CSS color string
 * @returns The closest lightness stop (5, 10, 20, ... 100, 110)
 */
export function detectLightnessStep(color: string): LightnessStop {
  const rgb = Color_(color).rgb().array();
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
  const c = Color_(color);

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
 * Generate all 11 lightness stops for a single color using Adobe Leonardo.
 *
 * This uses contrast-based color generation to produce perceptually even
 * lightness steps. The original color is detected within the scale, and
 * alpha variations are generated based on that detected position.
 *
 * @param color - A CSS color string (hex, rgb, hsl, etc.)
 * @returns An object containing solid stops, alpha stops, inverse alpha stops,
 *          and the detected step of the original color
 *
 * @example
 * ```ts
 * const result = generateLightnessStops("#509ee3");
 * // result.solid[40] might be the original color
 * // result.solid[5] is the lightest variation
 * // result.solid[110] is the darkest variation
 * ```
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

  const inputColor = new Color({
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

/**
 * Generate lightness stops for multiple colors at once.
 *
 * This is useful for generating a complete theme from a few input colors.
 * Customers can provide just brand, background-primary, and text-primary,
 * and this function will generate all the derived color stops.
 *
 * @param colors - An object mapping color names to CSS color values
 * @returns An object mapping each color name to its generated stops
 *
 * @example
 * ```ts
 * const theme = generateMultipleLightnessStops({
 *   brand: "#509ee3",
 *   "background-primary": "#ffffff",
 *   "text-primary": "#303030",
 * });
 *
 * theme.brand.solid[40]  // Brand color at step 40
 * theme.brand.detectedStep  // Where the original brand color sits (e.g., 40)
 * theme["background-primary"].solid[5]  // Lightest background variation
 * ```
 */
export function generateMultipleLightnessStops<T extends string>(
  colors: Record<T, string>,
): Record<T, GeneratedColorStops> {
  const result = {} as Record<T, GeneratedColorStops>;

  for (const [name, color] of Object.entries(colors) as [T, string][]) {
    result[name] = generateLightnessStops(color);
  }

  return result;
}

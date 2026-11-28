import { DEFAULT_ACCENT_COLORS } from "./constants/accent-colors";
import { getLightTheme } from "./constants/themes/light";
import { parseColor, toHex, toHsl } from "./css-color";

type HslColor = ReturnType<typeof toHsl>;

const SATURATION_FALLBACK_THRESHOLD = 20;

const FILTER_HUE_OFFSET = 90;
const SUMMARIZE_HUE_OFFSET = -90;

const POSITIVE_HUE = 89;
const NEGATIVE_HUE = 359;
const POSITIVE_NEGATIVE_LIGHTNESS = 50;

export interface HarmonyColors {
  filter: string;
  summarize: string;
  positive: string;
  negative: string;
  charts: string[];
}

const lowerHex = (color: ReturnType<typeof parseColor>) =>
  toHex(color).toLowerCase();

const normalize = (cssColor: string) => lowerHex(parseColor(cssColor));

const lightTheme = getLightTheme();

const FALLBACK: HarmonyColors = {
  filter: normalize(lightTheme.colors["core-filter"]),
  summarize: normalize(lightTheme.colors["core-summarize"]),
  positive: normalize(lightTheme.colors["feedback-positive"]),
  negative: normalize(lightTheme.colors["feedback-negative"]),
  charts: DEFAULT_ACCENT_COLORS.flatMap((c) => {
    if (c == null) {
      return [];
    }
    return [normalize(typeof c === "string" ? c : c.base)];
  }),
};
Object.freeze(FALLBACK);
Object.freeze(FALLBACK.charts);

const rotated = (brand: HslColor, degrees: number) => {
  const [hue, saturation, lightness] = brand.channels;
  const rotatedHue = (hue + degrees) % 360;
  return lowerHex({
    ...brand,
    channels: [
      rotatedHue < 0 ? 360 + rotatedHue : rotatedHue,
      saturation,
      lightness,
    ],
  });
};

/**
 * Derives accessory colors and an 8-color chart palette from a brand color.
 *
 * - `filter` and `summarize` use the square color harmony (brand ±90°), preserving
 *   the brand's lightness so they read at the same visual weight.
 * - `positive` and `negative` anchor to fixed hues (green / red) at lightness 50,
 *   keeping the brand's saturation so they fit the palette tonally.
 * - `charts[0]` is the brand color itself; `charts[1..7]` follow the octagonal
 *   color harmony at 45° increments, each preserving the brand's lightness.
 *
 * If the brand color's HSL saturation is below ~20%, returns a fixed default
 * palette regardless — rotations off a near-grey hue produce visually
 * indistinguishable colors.
 */
export const suggestHarmonyColors = (brand: string): HarmonyColors => {
  const brandColor = parseColor(brand);
  const hsl = toHsl(brandColor);
  const [, saturation] = hsl.channels;

  if (saturation < SATURATION_FALLBACK_THRESHOLD) {
    return FALLBACK;
  }

  const charts = [
    lowerHex(brandColor),
    ...Array.from({ length: 7 }, (_, i) => rotated(hsl, (i + 1) * 45)),
  ];

  return {
    filter: rotated(hsl, FILTER_HUE_OFFSET),
    summarize: rotated(hsl, SUMMARIZE_HUE_OFFSET),
    positive: lowerHex({
      ...hsl,
      channels: [POSITIVE_HUE, saturation, POSITIVE_NEGATIVE_LIGHTNESS],
    }),
    negative: lowerHex({
      ...hsl,
      channels: [NEGATIVE_HUE, saturation, POSITIVE_NEGATIVE_LIGHTNESS],
    }),
    charts,
  };
};

export const DEFAULT_HARMONY_COLORS = FALLBACK;

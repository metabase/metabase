import Color from "color";

import { DEFAULT_ACCENT_COLORS } from "./constants/accent-colors";
import { METABASE_LIGHT_THEME } from "./constants/themes/light";

type ColorInstance = ReturnType<typeof Color>;

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

const toHex = (c: ColorInstance) => c.hex().toLowerCase();

const normalize = (cssColor: string) => toHex(Color(cssColor));

const FALLBACK: HarmonyColors = {
  filter: normalize(METABASE_LIGHT_THEME.colors.filter),
  summarize: normalize(METABASE_LIGHT_THEME.colors.summarize),
  positive: normalize(METABASE_LIGHT_THEME.colors.success),
  negative: normalize(METABASE_LIGHT_THEME.colors.danger),
  charts: DEFAULT_ACCENT_COLORS.flatMap((c) => {
    if (c == null) {
      return [];
    }
    return [normalize(typeof c === "string" ? c : c.base)];
  }),
};
Object.freeze(FALLBACK);
Object.freeze(FALLBACK.charts);

const rotated = (brand: ColorInstance, degrees: number) =>
  toHex(brand.rotate(degrees));

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
  const brandColor = Color(brand);

  if (brandColor.saturationl() < SATURATION_FALLBACK_THRESHOLD) {
    return FALLBACK;
  }

  const charts = [
    toHex(brandColor),
    ...Array.from({ length: 7 }, (_, i) => rotated(brandColor, (i + 1) * 45)),
  ];

  return {
    filter: rotated(brandColor, FILTER_HUE_OFFSET),
    summarize: rotated(brandColor, SUMMARIZE_HUE_OFFSET),
    positive: toHex(
      brandColor.hue(POSITIVE_HUE).lightness(POSITIVE_NEGATIVE_LIGHTNESS),
    ),
    negative: toHex(
      brandColor.hue(NEGATIVE_HUE).lightness(POSITIVE_NEGATIVE_LIGHTNESS),
    ),
    charts,
  };
};

export const DEFAULT_HARMONY_COLORS = FALLBACK;

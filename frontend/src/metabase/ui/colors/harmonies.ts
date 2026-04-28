/* eslint-disable metabase/no-color-literals -- this module owns the static fallback palette used when a brand color is too desaturated to derive a harmony from */
import Color from "color";

import type { ColorHarmonyMode } from "metabase-types/api";

import { DEFAULT_ACCENT_COLORS } from "./constants/accent-colors";

type ColorInstance = ReturnType<typeof Color>;

const SATURATION_FALLBACK_THRESHOLD = 20;

const SQUARE_LIGHTER_DELTA = 10;

const POSITIVE_HUE = 130;
const NEGATIVE_HUE = 0;

const FILTER_HUE_OFFSET = 90;
const SUMMARIZE_HUE_OFFSET = -90;

export type HarmonyMode = Exclude<ColorHarmonyMode, "off">;

export interface HarmonyColors {
  filter: string;
  summarize: string;
  positive: string;
  negative: string;
  charts: string[];
}

const FALLBACK: HarmonyColors = {
  filter: "#7c7cd8",
  summarize: "#669533",
  positive: "#669533",
  negative: "#ed6e6e",
  charts: DEFAULT_ACCENT_COLORS as string[],
};

const toHex = (c: ColorInstance) => c.hex().toLowerCase();

const rotated = (brand: ColorInstance, degrees: number) =>
  toHex(brand.rotate(degrees));

const atHue = (brand: ColorInstance, hue: number) => toHex(brand.hue(hue));

const lighten = (color: ColorInstance, byPercent: number) => {
  const next = Math.min(100, color.lightness() + byPercent);
  return toHex(color.lightness(next));
};

const buildOctagonalCharts = (brand: ColorInstance): string[] =>
  Array.from({ length: 8 }, (_, i) => rotated(brand, i * 45));

const buildSquareCharts = (brand: ColorInstance): string[] => {
  const baseHues = Array.from({ length: 4 }, (_, i) => brand.rotate(i * 90));
  return baseHues.flatMap((c) => [toHex(c), lighten(c, SQUARE_LIGHTER_DELTA)]);
};

/**
 * Generates accessory and chart colors derived from `brand` using a hue-based color harmony.
 *
 * If the brand color's HSL saturation is below the fallback threshold (≈20%), returns a fixed
 * default palette regardless of mode — rotations off a near-grey hue produce visually
 * indistinguishable colors.
 */
export const suggestHarmonyColors = (
  brand: string,
  mode: HarmonyMode,
): HarmonyColors => {
  const brandColor = Color(brand);

  if (brandColor.saturationl() < SATURATION_FALLBACK_THRESHOLD) {
    return FALLBACK;
  }

  return {
    filter: rotated(brandColor, FILTER_HUE_OFFSET),
    summarize: rotated(brandColor, SUMMARIZE_HUE_OFFSET),
    positive: atHue(brandColor, POSITIVE_HUE),
    negative: atHue(brandColor, NEGATIVE_HUE),
    charts:
      mode === "octagonal"
        ? buildOctagonalCharts(brandColor)
        : buildSquareCharts(brandColor),
  };
};

export const DEFAULT_HARMONY_COLORS = FALLBACK;

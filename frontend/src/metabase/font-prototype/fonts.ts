// PROTOTYPE: the typefaces the font playground offers.
// To add one: `bun add @fontsource-variable/<name>`, then
// `node prototype/generate-font-registry.mjs`.

import { GENERATED_FONTS } from "./fonts.generated";
import type { FontTuning, PrototypeFont } from "./types";
import { mapAppWeights } from "./types";

/** The select value for "don't touch anything": the bundled Lato, as shipped. */
export const CURRENT_FONT_ID = "current";

/** The families the app asks for by name. The prototype font is registered under them. */
export const UI_FAMILY = "Lato";
export const MONOSPACE_FAMILY = "JetBrains Mono";

export const UI_FONTS = GENERATED_FONTS.filter(
  (font) => font.category !== "monospace",
);
export const MONOSPACE_FONTS = GENERATED_FONTS.filter(
  (font) => font.category === "monospace",
);

export function findFont(id: string): PrototypeFont | undefined {
  return GENERATED_FONTS.find((font) => font.id === id);
}

export function getFontLabel(font: PrototypeFont): string {
  const axes = font.axes.map((axis) => axis.tag).join(" ");
  return font.kind === "variable"
    ? `${font.family} · ${axes}`
    : `${font.family} · static`;
}

/** The weight range a font can render. For static fonts, the weights it ships. */
export function getWeightRange(font: PrototypeFont): {
  min: number;
  max: number;
} {
  if (font.kind === "static") {
    const weights = font.staticWeights.map((w) => w.weight);
    return { min: Math.min(...weights), max: Math.max(...weights) };
  }
  const wght = font.axes.find((axis) => axis.tag === "wght");
  return { min: wght?.min ?? 400, max: wght?.max ?? 400 };
}

export function getDefaultTuning(font: PrototypeFont): FontTuning {
  const { min, max } = getWeightRange(font);
  const clamp = (weight: number) => Math.min(max, Math.max(min, weight));
  const weights = mapAppWeights(clamp);
  return {
    weights,
    axes: {},
    sizeAdjustPct: 100,
    ascentOverridePct: undefined,
    descentOverridePct: undefined,
    lineGapOverridePct: undefined,
    letterSpacingEm: 0,
    featureSettings: "",
  };
}

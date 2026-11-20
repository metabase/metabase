// PROTOTYPE: the typefaces the font playground offers.
// To add one: `bun add @fontsource-variable/<name>`, then
// `node prototype/generate-font-registry.mjs`.

import { GENERATED_FONTS } from "./fonts.generated";
import { fontTuningKey, readStoredRecord } from "./storage";
import type { FontTuning, PrototypeFont } from "./types";
import { mapAppWeights } from "./types";

/** The select value for "don't touch anything": the bundled Lato, as shipped. */
export const CURRENT_FONT_ID = "current";

/** The families the app asks for by name. The prototype font is registered under them. */
export const UI_FAMILY = "Lato";
export const MONOSPACE_FAMILY = "JetBrains Mono";
/** Our own family for headings, used only when the heading font differs from the UI font. */
export const HEADING_FAMILY = "MB Prototype Headings";

/** The heading-font select value for "the UI font's pair, or the UI font itself". */
export const AUTO_HEADING_ID = "auto";

/** Superfamilies whose text cut gets its display cut for headings, on "Auto". */
const HEADING_PAIRS: Record<string, string> = {
  "wix-madefor-text": "wix-madefor-display",
};

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
  const pair = HEADING_PAIRS[font.id] && findFont(HEADING_PAIRS[font.id]);
  // "Wix Madefor Text + Display": the pair's last word names its cut.
  const family = pair
    ? `${font.family} + ${pair.family.split(" ").at(-1)}`
    : font.family;
  return font.kind === "variable"
    ? `${family} · ${axes}`
    : `${family} · static`;
}

/**
 * The font headings use. `undefined` means headings use the UI font (or Lato,
 * when the UI font is the shipped one).
 */
export function resolveHeadingFont(
  headingFontId: string,
  uiFont: PrototypeFont | undefined,
): PrototypeFont | undefined {
  const headingFont =
    headingFontId === AUTO_HEADING_ID
      ? uiFont && findFont(HEADING_PAIRS[uiFont.id] ?? uiFont.id)
      : findFont(headingFontId);
  return headingFont?.id === uiFont?.id ? undefined : headingFont;
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

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * The face-level settings (weights, axes, size and metrics) last saved for a
 * font while it was the UI font, or its defaults. Used for the heading font.
 */
export function readFontTuning(font: PrototypeFont): FontTuning {
  const defaults = getDefaultTuning(font);
  const stored = readStoredRecord(fontTuningKey(font.id));
  const storedWeights = stored.weights;
  const storedAxes = stored.axes;
  const weightRecord =
    typeof storedWeights === "object" && storedWeights !== null
      ? Object.fromEntries(Object.entries(storedWeights))
      : {};
  const axisRecord =
    typeof storedAxes === "object" && storedAxes !== null
      ? Object.fromEntries(Object.entries(storedAxes))
      : {};
  return {
    ...defaults,
    weights: mapAppWeights(
      (weight) => toNumber(weightRecord[weight]) ?? defaults.weights[weight],
    ),
    axes: Object.fromEntries(
      font.axes.flatMap((axis) => {
        const value = toNumber(axisRecord[axis.tag]);
        return value === undefined ? [] : [[axis.tag, value]];
      }),
    ),
    sizeAdjustPct: toNumber(stored.sizeAdjustPct) ?? defaults.sizeAdjustPct,
    ascentOverridePct: toNumber(stored.ascentOverridePct),
    descentOverridePct: toNumber(stored.descentOverridePct),
    lineGapOverridePct: toNumber(stored.lineGapOverridePct),
  };
}

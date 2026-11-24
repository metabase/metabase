// PROTOTYPE: types for the font playground (see FontPrototype.tsx).

export type FontAxis = {
  tag: string;
  min: number;
  max: number;
  default: number;
  step: number;
};

export type FontFile = {
  subset: string;
  url: string;
  unicodeRange: string;
};

type FontBase = {
  id: string;
  family: string;
  category: string;
  axes: FontAxis[];
};

export type VariableFont = FontBase & {
  kind: "variable";
  files: FontFile[];
};

export type StaticFont = FontBase & {
  kind: "static";
  staticWeights: { weight: number; files: FontFile[] }[];
};

export type PrototypeFont = VariableFont | StaticFont;

/** The weights the app's CSS asks for, which the panel lets you remap. */
export const APP_WEIGHTS = [400, 500, 600, 700, 900] as const;
export type AppWeight = (typeof APP_WEIGHTS)[number];

export function mapAppWeights(
  getWeight: (weight: AppWeight) => number,
): Record<AppWeight, number> {
  return {
    400: getWeight(400),
    500: getWeight(500),
    600: getWeight(600),
    700: getWeight(700),
    900: getWeight(900),
  };
}

/** Per-typeface settings. They're remembered per font, so switching back restores them. */
export type FontTuning = {
  weights: Record<AppWeight, number>;
  /** Axis tag → value. A missing axis uses the font's default (for opsz: automatic). */
  axes: Record<string, number>;
  sizeAdjustPct: number;
  ascentOverridePct: number | undefined;
  descentOverridePct: number | undefined;
  lineGapOverridePct: number | undefined;
  letterSpacingEm: number;
  featureSettings: string;
};

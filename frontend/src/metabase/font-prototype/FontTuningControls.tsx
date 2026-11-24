// PROTOTYPE: the Leva controls that belong to one typeface.
//
// Rendered with `key={font.id}`. Every input key starts with the font id, so
// Leva (and local storage) remember each font's settings separately: switch to
// another font and back, and your tuning is still there.

import { button, levaStore, useControls } from "leva";
import { useEffect, useMemo, useRef } from "react";

import { getDefaultTuning, getWeightRange } from "./fonts";
import { fontTuningKey, readStoredRecord, writeFontTuning } from "./storage";
import type { AppWeight, FontAxis, FontTuning, PrototypeFont } from "./types";
import { APP_WEIGHTS, mapAppWeights } from "./types";

const WEIGHT_NAMES: Record<AppWeight, string> = {
  400: "Regular 400",
  500: "Medium 500",
  600: "Semibold 600",
  700: "Bold 700",
  900: "Black 900",
};

/** Friendly names for the registered and common custom axes. */
const AXIS_NAMES: Record<string, string> = {
  opsz: "Optical size",
  wdth: "Width",
  slnt: "Slant",
  GRAD: "Grade",
  XOPQ: "Thick stroke",
  YOPQ: "Thin stroke",
  XTRA: "Counter width",
  YTAS: "Ascender",
  YTDE: "Descender",
  YTFI: "Figure height",
  YTLC: "Lowercase height",
  YTUC: "Uppercase height",
  FLAR: "Flare",
  VOLM: "Volume",
};

const FOLDERS = {
  metrics: "Size & spacing",
  weights: "Weights",
  axes: "Axes",
  features: "OpenType features",
};

/** Starting values when a vertical-metric override is switched on. */
const METRIC_STARTS = { ascent: 92, descent: 24, lineGap: 0 };

const FEATURES = [
  { tag: "tnum", label: "Tabular numbers" },
  { tag: "zero", label: "Slashed zero" },
  { tag: "case", label: "Case-sensitive forms" },
  { tag: "ss01", label: "Stylistic set 1" },
  { tag: "ss02", label: "Stylistic set 2" },
  { tag: "cv11", label: "cv11 (Inter: single-storey a)" },
] as const;

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function storedRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function axisLabel(axis: FontAxis) {
  return `${AXIS_NAMES[axis.tag] ?? axis.tag} (${axis.tag})`;
}

type Props = {
  font: PrototypeFont;
  onChange: (tuning: FontTuning) => void;
};

export function FontTuningControls({ font, onChange }: Props) {
  const stored = useMemo(
    () => readStoredRecord(fontTuningKey(font.id)),
    [font.id],
  );
  const defaults = useMemo(() => getDefaultTuning(font), [font]);
  const key = (name: string) => `${font.id}_${name}`;

  // Size and spacing
  const metrics = useControls(
    FOLDERS.metrics,
    {
      [key("size")]: {
        label: "Size adjust %",
        value: toNumber(stored.sizeAdjustPct, defaults.sizeAdjustPct),
        min: 70,
        max: 130,
        step: 0.5,
      },
      [key("letter")]: {
        label: "Letter spacing em",
        value: toNumber(stored.letterSpacingEm, defaults.letterSpacingEm),
        min: -0.05,
        max: 0.1,
        step: 0.001,
      },
      [key("ascent")]: {
        label: "Ascent override %",
        value: toNumber(stored.ascentOverridePct, METRIC_STARTS.ascent),
        min: 50,
        max: 130,
        step: 0.5,
        optional: true,
        disabled: toOptionalNumber(stored.ascentOverridePct) === undefined,
      },
      [key("descent")]: {
        label: "Descent override %",
        value: toNumber(stored.descentOverridePct, METRIC_STARTS.descent),
        min: 0,
        max: 60,
        step: 0.5,
        optional: true,
        disabled: toOptionalNumber(stored.descentOverridePct) === undefined,
      },
      [key("lineGap")]: {
        label: "Line gap override %",
        value: toNumber(stored.lineGapOverridePct, METRIC_STARTS.lineGap),
        min: 0,
        max: 40,
        step: 0.5,
        optional: true,
        disabled: toOptionalNumber(stored.lineGapOverridePct) === undefined,
      },
    },
    { order: 1 },
  );

  // Weight mapping: what each CSS weight in the app renders as.
  const storedWeights = storedRecord(stored.weights);
  const { min: minWeight, max: maxWeight } = getWeightRange(font);
  const weightsFolder = `${FOLDERS.weights} · ${minWeight}–${maxWeight}`;
  const weights = useControls(
    weightsFolder,
    Object.fromEntries(
      APP_WEIGHTS.map((weight) => {
        const value = toNumber(storedWeights[weight], defaults.weights[weight]);
        return [
          key(`w${weight}`),
          font.kind === "static"
            ? {
                label: WEIGHT_NAMES[weight],
                value,
                options: font.staticWeights.map((w) => w.weight),
              }
            : {
                label: WEIGHT_NAMES[weight],
                value,
                min: minWeight,
                max: maxWeight,
                step: 1,
              },
        ];
      }),
    ),
    { order: 2 },
  );

  // Variable axes other than weight. Optical size defaults to automatic.
  const storedAxes = storedRecord(stored.axes);
  const otherAxes = font.axes.filter((axis) => axis.tag !== "wght");
  const axes = useControls(
    FOLDERS.axes,
    Object.fromEntries(
      otherAxes.map((axis) => {
        const storedValue = toOptionalNumber(storedAxes[axis.tag]);
        const isOpsz = axis.tag === "opsz";
        return [
          key(`axis_${axis.tag}`),
          {
            label: isOpsz ? "Optical size (off = auto)" : axisLabel(axis),
            value: storedValue ?? axis.default,
            min: axis.min,
            max: axis.max,
            step: axis.step < 1 ? axis.step : 1,
            ...(isOpsz
              ? { optional: true, disabled: storedValue === undefined }
              : {}),
          },
        ];
      }),
    ),
    { order: 3, collapsed: otherAxes.length === 0 },
  );

  // OpenType features
  const storedFeatures =
    typeof stored.featureSettings === "string" ? stored.featureSettings : "";
  const hasFeature = (tag: string) => storedFeatures.includes(`"${tag}" 1`);
  const storedExtra = storedFeatures
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !FEATURES.some((f) => part === `"${f.tag}" 1`))
    .join(", ");
  const features = useControls(
    FOLDERS.features,
    Object.fromEntries(
      FEATURES.map((feature) => [
        key(`fea_${feature.tag}`),
        { label: feature.label, value: hasFeature(feature.tag) },
      ]),
    ),
    { order: 4, collapsed: true },
  );
  const moreFeatures = useControls(FOLDERS.features, {
    [key("fea_extra")]: {
      label: "More (CSS syntax)",
      value: storedExtra,
    },
  });

  const resetRef = useRef(() => {});
  resetRef.current = () => {
    const values: [string, number | string | boolean][] = [
      [`${FOLDERS.metrics}.${key("size")}`, defaults.sizeAdjustPct],
      [`${FOLDERS.metrics}.${key("letter")}`, defaults.letterSpacingEm],
      [`${FOLDERS.features}.${key("fea_extra")}`, ""],
      ...APP_WEIGHTS.map((weight): [string, number] => [
        `${weightsFolder}.${key(`w${weight}`)}`,
        defaults.weights[weight],
      ]),
      ...otherAxes.map((axis): [string, number] => [
        `${FOLDERS.axes}.${key(`axis_${axis.tag}`)}`,
        axis.default,
      ]),
      ...FEATURES.map((feature): [string, boolean] => [
        `${FOLDERS.features}.${key(`fea_${feature.tag}`)}`,
        false,
      ]),
    ];
    levaStore.set(Object.fromEntries(values), false);
  };
  useControls(
    "Actions",
    {
      [`Reset ${font.family}`]: button(() => resetRef.current()),
    },
    { order: 7 },
  );

  const extraFeatures = toText(moreFeatures[key("fea_extra")]);
  const featureSettings = [
    ...FEATURES.filter((feature) => features[key(`fea_${feature.tag}`)]).map(
      (feature) => `"${feature.tag}" 1`,
    ),
    ...(extraFeatures ? [extraFeatures] : []),
  ].join(", ");

  const tuning: FontTuning = {
    weights: mapAppWeights((weight) =>
      toNumber(weights[key(`w${weight}`)], defaults.weights[weight]),
    ),
    axes: Object.fromEntries(
      otherAxes.flatMap((axis) => {
        const value = toOptionalNumber(axes[key(`axis_${axis.tag}`)]);
        return value === undefined ? [] : [[axis.tag, value]];
      }),
    ),
    sizeAdjustPct: toNumber(metrics[key("size")], defaults.sizeAdjustPct),
    letterSpacingEm: toNumber(metrics[key("letter")], 0),
    ascentOverridePct: toOptionalNumber(metrics[key("ascent")]),
    descentOverridePct: toOptionalNumber(metrics[key("descent")]),
    lineGapOverridePct: toOptionalNumber(metrics[key("lineGap")]),
    featureSettings,
  };
  // Report only real changes: `tuning` is a new object on every render.
  const tuningJson = JSON.stringify(tuning);
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current(tuningRef.current);
    writeFontTuning(font.id, tuningRef.current);
  }, [font.id, tuningJson]);

  return null;
}

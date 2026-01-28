import Color from "color";

import { getColorScale, getSafeColor } from "metabase/lib/colors/scales";
import type {
  NumberFormattingSetting,
  NumberRangeFormattingSetting,
  NumberSingleFormattingSetting,
} from "metabase/visualizations/components/settings/ChartSettingsNumberFormatting";

const GRADIENT_ALPHA = 0.75;
const MIN_ALPHA = 0.000001;

type FormatterFn = (value: number) => string | null;

const OPERATOR_FORMATTER_FACTORIES: Record<
  NumberSingleFormattingSetting["operator"],
  (value: number, color: string) => FormatterFn
> = {
  "<": (value, color) => (v) => v < value ? color : null,
  "<=": (value, color) => (v) => v <= value ? color : null,
  ">=": (value, color) => (v) => v >= value ? color : null,
  ">": (value, color) => (v) => v > value ? color : null,
  "=": (value, color) => (v) => v === value ? color : null,
  "!=": (value, color) => (v) => v !== value ? color : null,
};

function clampAlpha(alpha: number): number {
  if (alpha === 0) {
    return 0;
  }
  return Math.min(GRADIENT_ALPHA, Math.max(MIN_ALPHA, alpha));
}

function compileSingleFormatter(
  format: NumberSingleFormattingSetting,
): FormatterFn {
  const { operator, value, color } = format;
  const numericValue = typeof value === "string" ? parseFloat(value) : value;

  if (Number.isNaN(numericValue)) {
    return () => null;
  }

  const formatterFactory = OPERATOR_FORMATTER_FACTORIES[operator];
  if (formatterFactory) {
    return formatterFactory(numericValue, color);
  }

  console.error("Unsupported formatting operator:", operator);
  return () => null;
}

function compileRangeFormatter(
  format: NumberRangeFormattingSetting,
): FormatterFn {
  const min = format.min_value ?? 0;
  const max = format.max_value ?? 100;

  if (typeof max !== "number" || typeof min !== "number") {
    console.warn("Invalid range min/max", min, max);
    return () => null;
  }

  const scale = getColorScale(
    [min, max],
    format.colors.map((c) => {
      const color = Color(c);
      const alpha = color.alpha();
      return color.alpha(clampAlpha(alpha)).toString();
    }),
  );

  // scaleLinear has clamp method, scaleQuantile does not
  if ("clamp" in scale) {
    (scale as { clamp: (clamp: boolean) => void }).clamp(true);
  }

  return (value: number) => {
    const colorValue = scale(value);
    if (!colorValue) {
      return null;
    }
    return getSafeColor(colorValue);
  };
}

export function compileNumberFormatter(
  format: NumberFormattingSetting,
): FormatterFn {
  if (format.type === "single") {
    return compileSingleFormatter(format);
  } else if (format.type === "range") {
    return compileRangeFormatter(format);
  }
  return () => null;
}

export function getNumberColor(
  value: unknown,
  formattingRules: NumberFormattingSetting[] | undefined,
): string | null {
  if (!formattingRules || formattingRules.length === 0) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : parseFloat(String(value));

  if (Number.isNaN(numericValue)) {
    return null;
  }

  for (const rule of formattingRules) {
    const formatter = compileNumberFormatter(rule);
    const color = formatter(numericValue);
    if (color != null) {
      return color;
    }
  }

  return null;
}

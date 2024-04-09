import { formatValue } from "metabase/lib/formatting";
import type { OptionsType } from "metabase/lib/formatting/types";

export const COMPACT_MAX_WIDTH = 250;
export const COMPACT_WIDTH_PER_DIGIT = 25;
export const COMPACT_MIN_LENGTH = 6;

function checkShouldCompact(fullValue: string, width: number) {
  const expectedCompactWidth = fullValue.length * COMPACT_WIDTH_PER_DIGIT;
  return (
    fullValue.length > COMPACT_MIN_LENGTH &&
    (width < COMPACT_MAX_WIDTH || width < expectedCompactWidth)
  );
}

export function compactifyValue(
  value: number,
  width: number,
  formatOptions: OptionsType = {},
) {
  const fullScalarValue = formatValue(value, {
    ...formatOptions,
    compact: false,
  });

  const canCompact = typeof fullScalarValue === "string";
  if (!canCompact) {
    return { displayValue: fullScalarValue, fullScalarValue };
  }

  const displayValue =
    formatOptions.compact || checkShouldCompact(fullScalarValue, width)
      ? formatValue(value, {
          ...formatOptions,
          compact: true,
        })
      : fullScalarValue;

  return { displayValue, fullScalarValue };
}

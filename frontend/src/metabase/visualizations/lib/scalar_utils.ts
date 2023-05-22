import { formatValue } from "metabase/lib/formatting";
import { OptionsType } from "metabase/lib/formatting/types";

// used below to determine whether we show compact formatting
export const COMPACT_MAX_WIDTH = 250;
export const COMPACT_WIDTH_PER_DIGIT = 25;
export const COMPACT_MIN_LENGTH = 6;

export function compactifyValue(
  value: number,
  width: number,
  formatOptions: OptionsType = {},
) {
  const fullScalarValue = formatValue(value, {
    ...formatOptions,
    compact: false,
  });
  const compactScalarValue = formatValue(value, {
    ...formatOptions,
    compact: true,
  });

  // use the compact version of formatting if the component is narrower than
  // the cutoff and the formatted value is longer than the cutoff
  // also if the width is less than a certain multiplier of the number of digits
  const displayCompact =
    fullScalarValue !== null &&
    typeof fullScalarValue === "string" &&
    fullScalarValue.length > COMPACT_MIN_LENGTH &&
    (width < COMPACT_MAX_WIDTH ||
      width < COMPACT_WIDTH_PER_DIGIT * fullScalarValue.length);
  const displayValue = displayCompact ? compactScalarValue : fullScalarValue;

  return { displayValue, fullScalarValue };
}

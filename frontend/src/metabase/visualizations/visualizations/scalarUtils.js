import { formatValue } from "metabase/lib/formatting";

// used below to determine whether we show compact formatting
const COMPACT_MAX_WIDTH = 250;
const COMPACT_WIDTH_PER_DIGIT = 25;
const COMPACT_MIN_LENGTH = 6;

export function compactifyValue({ formatOptions, value, width }) {
  const fullScalarValue = formatValue(value, formatOptions);
  const compactScalarValue = formatValue(value, {
    ...formatOptions,
    compact: true,
  });

  // use the compact version of formatting if the component is narrower than
  // the cutoff and the formatted value is longer than the cutoff
  // also if the width is less than a certain multiplier of the number of digits
  const displayCompact =
    fullScalarValue !== null &&
    fullScalarValue.length > COMPACT_MIN_LENGTH &&
    (width < COMPACT_MAX_WIDTH ||
      width < COMPACT_WIDTH_PER_DIGIT * fullScalarValue.length);
  const displayValue = displayCompact ? compactScalarValue : fullScalarValue;

  return { displayValue, fullScalarValue };
}

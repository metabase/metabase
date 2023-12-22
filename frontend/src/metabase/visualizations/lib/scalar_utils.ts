// eslint-disable-next-line no-restricted-imports -- deprecated usage
import type { Moment } from "moment-timezone";
import { formatValue } from "metabase/lib/formatting";
import type { OptionsType } from "metabase/lib/formatting/types";

export const COMPACT_MAX_WIDTH = 250;
export const COMPACT_WIDTH_PER_DIGIT = 25;
export const COMPACT_MIN_LENGTH = 6;

function checkShouldCompact(fullValue: unknown, width: number) {
  const canCompact = typeof fullValue === "string";
  if (!canCompact) {
    return false;
  }

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
  origDisplayValue?: string | number | JSX.Element | Moment | null,
) {
  const fullScalarValue = formatValue(value, {
    ...formatOptions,
    compact: false,
  });

  if (formatOptions.compact && origDisplayValue) {
    return { displayValue: origDisplayValue, fullScalarValue };
  }

  const displayValue = checkShouldCompact(fullScalarValue, width)
    ? formatValue(value, {
        ...formatOptions,
        compact: true,
      })
    : fullScalarValue;

  return { displayValue, fullScalarValue };
}

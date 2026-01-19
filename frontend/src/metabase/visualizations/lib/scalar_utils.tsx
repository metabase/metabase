import { ColorPill } from "metabase/common/components/ColorPill";
import { formatValue } from "metabase/lib/formatting";
import type { OptionsType } from "metabase/lib/formatting/types";
import { Text } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import type { RowValue, ScalarSegment } from "metabase-types/api";

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
  value: RowValue,
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

const DEFAULT_COLOR = color("text-primary");

export function getColor(_value: RowValue, segments?: ScalarSegment[]) {
  const value = parseInt(String(_value));

  if (!segments || segments.length === 0 || Number.isNaN(value)) {
    return DEFAULT_COLOR;
  }

  const segment = segments.find((s) => s.min <= value && value <= s.max);

  if (!segment || !segment.color) {
    return DEFAULT_COLOR;
  }
  return segment.color;
}

export function getTooltipContent(segments?: ScalarSegment[]) {
  if (!segments || segments.length === 0) {
    return null;
  }

  return (
    <table style={{ borderSpacing: "0.75rem 0.25rem" }}>
      <tbody>
        {segments.map(({ color, min, max, label }: ScalarSegment, index) => (
          <tr key={index}>
            <td>
              <ColorPill color={color} pillSize="xsmall" />
            </td>
            <td>
              <Text c="inherit" lh="md">{`${min} - ${max}`}</Text>
            </td>
            <td>
              <Text c="inherit" lh="md">
                {label}
              </Text>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

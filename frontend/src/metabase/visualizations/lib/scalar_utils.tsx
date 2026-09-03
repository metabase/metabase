import { ColorPill } from "metabase/common/components/ColorPill";
import { Text } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import type { ResolvedOpenEndedGoalSegment } from "metabase/visualizations/lib/dynamic-goals";
import { formatValue } from "metabase/visualizations/lib/formatting";
import type { ColumnSettings, RowValue } from "metabase-types/api";

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
  formatOptions: ColumnSettings = {},
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

const getSegmentBounds = ({ min, max }: ResolvedOpenEndedGoalSegment) => ({
  min: min ?? -Infinity,
  max: max ?? Infinity,
});

const formatSegmentRange = ({ min, max }: ResolvedOpenEndedGoalSegment) => {
  if (min != null && max != null) {
    return `${min} - ${max}`;
  }

  if (min != null) {
    return `≥ ${min}`;
  }

  if (max != null) {
    return `≤ ${max}`;
  }

  return "";
};

export function getColor(
  _value: RowValue,
  segments?: ResolvedOpenEndedGoalSegment[],
) {
  const value = parseFloat(String(_value));

  if (!segments || segments.length === 0 || Number.isNaN(value)) {
    return DEFAULT_COLOR;
  }

  const segment = segments.find((s) => {
    const { min, max } = getSegmentBounds(s);
    return min <= value && value <= max;
  });

  if (!segment || !segment.color) {
    return DEFAULT_COLOR;
  }
  return segment.color;
}

export function getTooltipContent(segments?: ResolvedOpenEndedGoalSegment[]) {
  if (!segments || segments.length === 0) {
    return null;
  }

  return (
    <table style={{ borderSpacing: "0.75rem 0.25rem" }}>
      <tbody>
        {segments.map((segment, index) => (
          <tr key={index}>
            <td>
              <ColorPill color={segment.color} pillSize="xsmall" />
            </td>
            <td>
              <Text c="inherit" lh="md">
                {formatSegmentRange(segment)}
              </Text>
            </td>
            <td>
              <Text c="inherit" lh="md">
                {segment.label}
              </Text>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

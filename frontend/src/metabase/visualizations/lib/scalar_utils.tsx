import { ColorPill } from "metabase/common/components/ColorPill";
import { Text } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import { formatValue } from "metabase/value-formatting";
import type {
  ColumnSettings,
  RowValue,
  ScalarSegment,
} from "metabase-types/api";

// slight overestimates of Lato Bold character widths (digits ≈0.58em,
// separators ≈0.22em), so borderline values compact instead of overflowing
const CHAR_WIDTH_EM = 0.6;
const THIN_CHAR_WIDTH_EM = 0.25;
const THIN_CHARS_PATTERN = /[.,'\u2019\u00A0\u202F ]/;

// font sizes render in rem, so the effective pixel size follows the root font
// scale while the measured container width stays in device pixels
export function getRootFontScale() {
  if (typeof document === "undefined") {
    return 1;
  }
  const rootFontSize = parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  return Number.isFinite(rootFontSize) ? rootFontSize / 16 : 1;
}

export function estimateScalarValueWidth(text: string, fontSize: number) {
  const widthEm = [...text].reduce(
    (total, char) =>
      total +
      (THIN_CHARS_PATTERN.test(char) ? THIN_CHAR_WIDTH_EM : CHAR_WIDTH_EM),
    0,
  );
  return widthEm * fontSize * getRootFontScale();
}

function checkShouldCompact(
  fullValue: string,
  width: number,
  fontSize: number,
) {
  return estimateScalarValueWidth(fullValue, fontSize) > width;
}

export function compactifyValue(
  value: RowValue,
  width: number,
  fontSize: number,
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
    formatOptions.compact ||
    checkShouldCompact(fullScalarValue, width, fontSize)
      ? formatValue(value, {
          ...formatOptions,
          compact: true,
        })
      : fullScalarValue;

  return { displayValue, fullScalarValue };
}

const DEFAULT_COLOR = color("text-primary");

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const getSegmentBounds = ({ min, max }: ScalarSegment) => ({
  min: isFiniteNumber(min) ? min : -Infinity,
  max: isFiniteNumber(max) ? max : Infinity,
});

const formatSegmentRange = ({ min, max }: ScalarSegment) => {
  const hasMin = isFiniteNumber(min);
  const hasMax = isFiniteNumber(max);

  if (hasMin && hasMax) {
    return `${min} - ${max}`;
  }

  if (hasMin) {
    return `≥ ${min}`;
  }

  if (hasMax) {
    return `≤ ${max}`;
  }

  return "";
};

export function getColor(_value: RowValue, segments?: ScalarSegment[]) {
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
              <Text c="inherit" lh="md">
                {formatSegmentRange({ min, max, color, label })}
              </Text>
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

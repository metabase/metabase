import { Flex, Text } from "metabase/ui";
import { isEmpty } from "metabase/utils/validate";
import { formatValue } from "metabase/value-formatting";
import type { ColumnSettings } from "metabase-types/api";

import { TrendSymbol } from "./TrendSymbol";
import { CHANGE_TYPE_OPTIONS, type ComparisonResult } from "./compute";

const SYMBOL_SIZE = 12;
const PERCENT_MIN_WIDTH = 48;

function getValueFormatted(
  comparison: ComparisonResult,
  formatOptions: ColumnSettings,
) {
  const { comparisonValue, display, isComparisonValueVisible } = comparison;

  if (!isComparisonValueVisible) {
    return null;
  }

  if (!isEmpty(comparisonValue)) {
    return formatValue(comparisonValue, { ...formatOptions, compact: true });
  }

  return display.comparisonValue;
}

interface PreviousValueComparisonProps {
  comparison: ComparisonResult;
  formatOptions: ColumnSettings;
  className?: string;
}

export function PreviousValueComparisonTooltip({
  comparison,
  formatOptions,
  className,
}: PreviousValueComparisonProps) {
  const {
    changeArrowIconName,
    changeColorName,
    changeType,
    comparisonDescStr,
    display,
  } = comparison;

  const isSame = changeType === CHANGE_TYPE_OPTIONS.SAME.CHANGE_TYPE;
  const symbolDirection = changeArrowIconName ?? (isSame ? "no_change" : null);
  const percentColor =
    changeColorName != null
      ? (`${changeColorName}-strong` as const)
      : "text-primary";
  const valueFormatted = getValueFormatted(comparison, formatOptions);

  return (
    <div className={className}>
      <Flex gap={4} align="center">
        {symbolDirection != null && (
          <TrendSymbol
            direction={symbolDirection}
            colorName={changeColorName}
            size={SYMBOL_SIZE}
          />
        )}
        <Text
          component="span"
          fw={700}
          fz="md"
          lh="md"
          miw={PERCENT_MIN_WIDTH}
          c={percentColor}
        >
          {display.percentChange}
        </Text>
      </Flex>
      <Text component="span" fz="sm" lh="sm" c="text-secondary">
        {comparisonDescStr}
      </Text>
      <Text
        component="span"
        fw={700}
        fz="md"
        lh="md"
        c="text-primary"
        ta="right"
      >
        {valueFormatted}
      </Text>
    </div>
  );
}

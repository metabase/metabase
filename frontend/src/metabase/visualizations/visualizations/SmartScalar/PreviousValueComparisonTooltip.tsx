import { Flex, Text } from "metabase/ui";
import { isEmpty } from "metabase/utils/validate";
import { formatValue } from "metabase/value-formatting";
import type { ColumnSettings } from "metabase-types/api";

import { TrendSymbol } from "./TrendSymbol";
import { type ComparisonResult, getComparisonDisplay } from "./compute";

const SYMBOL_SIZE = 12;
const PERCENT_MIN_WIDTH = 48;

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
  const { changeColorName, comparisonDescStr, comparisonValue, display } =
    comparison;

  const { sentimentColor, symbolDirection } = getComparisonDisplay(
    comparison,
    formatOptions,
  );
  const percentColor = sentimentColor ?? "text-primary";
  const valueFormatted = !isEmpty(comparisonValue)
    ? formatValue(comparisonValue, { ...formatOptions, compact: true })
    : display.comparisonValue;

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

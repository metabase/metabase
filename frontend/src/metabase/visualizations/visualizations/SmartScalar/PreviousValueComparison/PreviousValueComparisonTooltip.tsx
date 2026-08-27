import { Flex, Text } from "metabase/ui";
import { isEmpty } from "metabase/utils/validate";
import { formatValue } from "metabase/value-formatting";
import type { ColumnSettings } from "metabase-types/api";

import { TrendSymbol } from "../TrendSymbol";
import { CHANGE_TYPE_OPTIONS, type ComparisonResult } from "../compute";

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
  const {
    changeArrowIconName,
    changeColorName,
    changeType,
    comparisonDescStr,
    comparisonValue,
    display,
  } = comparison;

  const isSame = changeType === CHANGE_TYPE_OPTIONS.SAME.CHANGE_TYPE;
  const symbolDirection = changeArrowIconName ?? (isSame ? "no_change" : null);
  const percentColor =
    changeColorName != null
      ? (`${changeColorName}-strong` as const)
      : "text-primary";
  const valueFormatted = !isEmpty(comparisonValue)
    ? formatValue(comparisonValue, { ...formatOptions, compact: true })
    : display.comparisonValue;

  return (
    <Flex
      h={32}
      align="center"
      justify="space-between"
      gap="md"
      className={className}
    >
      <Flex gap={12} align="center">
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
            fz={14}
            lh={1.22}
            miw={PERCENT_MIN_WIDTH}
            c={percentColor}
          >
            {display.percentChange}
          </Text>
        </Flex>
        {comparisonDescStr && (
          <Text component="span" fz={12} lh={1.15} c="text-secondary">
            {comparisonDescStr}
          </Text>
        )}
      </Flex>
      {valueFormatted != null && valueFormatted !== "" && (
        <Text
          component="span"
          fw={700}
          fz={14}
          lh={1.22}
          c="text-primary"
          ta="right"
        >
          {valueFormatted}
        </Text>
      )}
    </Flex>
  );
}

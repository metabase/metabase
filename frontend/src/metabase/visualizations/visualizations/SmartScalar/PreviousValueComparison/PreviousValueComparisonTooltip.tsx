import { Flex, Text } from "metabase/ui";
import { formatValue } from "metabase/value-formatting";
import type { ColumnSettings } from "metabase-types/api";

import { TrendSymbol } from "../TrendSymbol";
import { CHANGE_TYPE_OPTIONS, type ComparisonResult } from "../compute";
import { TEXT_SPACING } from "../constants";

const TOOLTIP_SYMBOL_SIZE = 12;

interface PreviousValueComparisonProps {
  comparison: ComparisonResult;
  formatOptions: ColumnSettings;
}

export function PreviousValueComparisonTooltip({
  comparison,
  formatOptions,
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
  const isChanged = changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE;
  const symbolDirection = changeArrowIconName ?? (isSame ? "no_change" : null);
  const valueFormatted = isChanged
    ? formatValue(comparisonValue, { ...formatOptions, compact: true })
    : display.comparisonValue;

  return (
    <Flex gap={TEXT_SPACING} align="center">
      {symbolDirection != null && (
        <TrendSymbol
          direction={symbolDirection}
          colorName={changeColorName}
          size={TOOLTIP_SYMBOL_SIZE}
        />
      )}
      <Text component="span" fw={700} c="core-white" lh={1.2}>
        {display.percentChange}
      </Text>
      {comparisonDescStr && (
        <Text component="span" c="core-white" lh={1.2}>
          {comparisonDescStr}
        </Text>
      )}
      {valueFormatted != null && valueFormatted !== "" && (
        <Text component="span" fw={700} c="core-white" lh={1.2} ml="md">
          {valueFormatted}
        </Text>
      )}
    </Flex>
  );
}

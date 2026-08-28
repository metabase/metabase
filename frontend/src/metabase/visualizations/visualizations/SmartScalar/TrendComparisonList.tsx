import { Ellipsified, Flex, Stack, Text } from "metabase/ui";
import { formatValue } from "metabase/value-formatting";
import type { ColumnSettings } from "metabase-types/api";

import S from "./TrendComparisonList.module.css";
import { CHANGE_TYPE_OPTIONS, type ComparisonResult } from "./compute";

const LIST_WIDTH = 360;

const getChangeSign = (percentChange: number | undefined) => {
  if (percentChange == null || percentChange === 0) {
    return "";
  }
  return percentChange < 0 ? "-" : "+";
};

const getChangeText = (
  comparison: ComparisonResult,
  formatOptions: ColumnSettings,
) => {
  const { changeType, comparisonValue, display, percentChange } = comparison;
  const isChanged = changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE;
  const isMissing = changeType === CHANGE_TYPE_OPTIONS.MISSING.CHANGE_TYPE;

  if (isChanged) {
    const valueDisplay = formatValue(comparisonValue, {
      ...formatOptions,
      compact: true,
    });
    const sign = getChangeSign(percentChange);
    return valueDisplay != null && valueDisplay !== ""
      ? `${sign}${display.percentChange} (${valueDisplay})`
      : `${sign}${display.percentChange}`;
  }

  if (isMissing) {
    return `${display.percentChange} ${display.comparisonValue}`;
  }

  return display.percentChange;
};

interface TrendComparisonListProps {
  comparisons: ComparisonResult[];
  formatOptions: ColumnSettings;
}

export function TrendComparisonList({
  comparisons,
  formatOptions,
}: TrendComparisonListProps) {
  return (
    <Stack
      w={LIST_WIDTH}
      maw="100%"
      gap={0}
      data-testid="scalar-comparison-list"
    >
      {comparisons.map((comparison, index) => (
        <Flex
          key={index}
          align="center"
          justify="space-between"
          gap="md"
          className={S.row}
          data-testid="scalar-previous-value"
        >
          <Ellipsified showTooltip={false}>
            <Text component="span" fz="md" lh="md" c="text-secondary">
              {comparison.comparisonDescStr}
            </Text>
          </Ellipsified>
          <Text
            component="span"
            fz="md"
            lh="md"
            flex="0 0 auto"
            c={
              comparison.changeColorName != null
                ? `${comparison.changeColorName}-strong`
                : "text-primary"
            }
          >
            {getChangeText(comparison, formatOptions)}
          </Text>
        </Flex>
      ))}
    </Stack>
  );
}

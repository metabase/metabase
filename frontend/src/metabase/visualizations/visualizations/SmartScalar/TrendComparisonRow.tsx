import { Badge, Ellipsified, Flex, Stack, Text, Tooltip } from "metabase/ui";
import { formatValue } from "metabase/value-formatting";
import { SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS } from "metabase/visualizations/lib/image-exports";
import type { ColumnSettings } from "metabase-types/api";

import { PreviousValueComparisonTooltip } from "./PreviousValueComparisonTooltip";
import S from "./TrendComparisonRow.module.css";
import {
  CHANGE_TYPE_OPTIONS,
  type ComparisonResult,
  type Trend,
} from "./compute";
import { TEXT_SPACING } from "./constants";

const getChangeSign = (percentChange: number | undefined) => {
  if (percentChange == null || percentChange === 0) {
    return "";
  }
  return percentChange < 0 ? "-" : "+";
};

interface TrendComparisonRowProps {
  trend: Trend;
  formatOptions: ColumnSettings;
}

export function TrendComparisonRow({
  trend,
  formatOptions,
}: TrendComparisonRowProps) {
  const { comparisons, display } = trend;
  const comparison: ComparisonResult | undefined = comparisons[0];

  if (comparison == null) {
    return null;
  }

  const {
    changeColorName,
    changeType,
    comparisonDescStr,
    comparisonDescShortStr,
    comparisonValue,
    percentChange,
  } = comparison;

  const isChanged = changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE;
  const isMissing = changeType === CHANGE_TYPE_OPTIONS.MISSING.CHANGE_TYPE;
  const changeColor =
    changeColorName != null
      ? (`${changeColorName}-strong` as const)
      : "text-secondary";
  const changeDesc = isChanged
    ? (comparisonDescShortStr ?? comparisonDescStr)
    : comparisonDescStr;
  const changeText = [
    `${getChangeSign(percentChange)}${comparison.display.percentChange}`,
    changeDesc,
  ]
    .filter(Boolean)
    .join(" ");
  const comparisonValueDisplay = isChanged
    ? formatValue(comparisonValue, { ...formatOptions, compact: true })
    : isMissing
      ? comparison.display.comparisonValue
      : null;
  const extraComparisonsCount = comparisons.length - 1;

  return (
    <Tooltip
      position="bottom"
      classNames={{ tooltip: S.comparisonPanel }}
      label={
        <Stack gap={0}>
          {comparisons.map((comparison, index) => (
            <PreviousValueComparisonTooltip
              comparison={comparison}
              key={index}
              formatOptions={formatOptions}
              className={S.comparisonRow}
            />
          ))}
        </Stack>
      }
    >
      <Flex
        gap={TEXT_SPACING}
        align="center"
        justify="center"
        maw="100%"
        fz={12}
        lh={1.15}
        data-testid="scalar-previous-value"
      >
        <Ellipsified showTooltip={false}>
          {display.date != null && display.date !== "" && (
            <Text component="span" fz={12} lh={1.15} c="text-secondary">
              {display.date}
              {", "}
            </Text>
          )}
          <Text component="span" fz={12} lh={1.15} c={changeColor}>
            {changeText}
          </Text>
          {comparisonValueDisplay != null && comparisonValueDisplay !== "" && (
            <Text component="span" fz={12} lh={1.15} c={changeColor}>
              {isChanged ? (
                <> ({comparisonValueDisplay})</>
              ) : (
                <> {comparisonValueDisplay}</>
              )}
            </Text>
          )}
        </Ellipsified>
        {extraComparisonsCount > 0 && (
          <Badge
            px={6}
            size="xs"
            variant="light"
            c="text-primary"
            className={SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS}
          >
            +{extraComparisonsCount}
          </Badge>
        )}
      </Flex>
    </Tooltip>
  );
}

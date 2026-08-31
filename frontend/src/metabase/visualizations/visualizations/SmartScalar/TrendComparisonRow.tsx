import { Badge, Box, Flex, Text, Tooltip } from "metabase/ui";
import { useIsTruncated } from "metabase/ui/hooks/use-is-truncated";
import { formatValue } from "metabase/value-formatting";
import { SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS } from "metabase/viz-core";
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

const SIZE_GAPS = { sm: TEXT_SPACING, lg: 6 };

interface TrendComparisonRowProps {
  trend: Trend;
  formatOptions: ColumnSettings;
  percentOnly?: boolean;
  size?: "sm" | "lg";
  compactValue?: boolean;
}

export function TrendComparisonRow({
  trend,
  formatOptions,
  percentOnly,
  size = "sm",
  compactValue = true,
}: TrendComparisonRowProps) {
  const { isTruncated, ref: comparisonTextRef } =
    useIsTruncated<HTMLDivElement>({ ignoreHeightTruncation: true });

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
  const changeSign = isChanged ? getChangeSign(percentChange) : "";
  const changeText = [
    `${changeSign}${comparison.display.percentChange}`,
    changeDesc,
  ]
    .filter(Boolean)
    .join(" ");
  const comparisonValueDisplay = isChanged
    ? formatValue(comparisonValue, { ...formatOptions, compact: compactValue })
    : isMissing
      ? comparison.display.comparisonValue
      : null;
  const extraComparisonsCount = comparisons.length - 1;

  const showsPanel = percentOnly || extraComparisonsCount > 0 || isTruncated;

  return (
    <Tooltip
      position="bottom"
      disabled={!showsPanel}
      classNames={{ tooltip: S.comparisonPanel }}
      label={
        <div className={S.comparisonTable}>
          {comparisons.map((comparison, index) => (
            <PreviousValueComparisonTooltip
              comparison={comparison}
              key={index}
              formatOptions={formatOptions}
              className={S.comparisonRow}
            />
          ))}
        </div>
      }
    >
      <Flex
        gap={SIZE_GAPS[size]}
        align="center"
        justify="center"
        maw="100%"
        fz={size}
        lh={size}
        data-testid="scalar-previous-value"
      >
        <Box ref={comparisonTextRef} className={S.comparisonText}>
          {percentOnly ? (
            <Text component="span" fz={size} lh={size} c={changeColor}>
              {changeSign}
              {comparison.display.percentChange}
            </Text>
          ) : (
            <>
              {display.date != null && display.date !== "" && (
                <Text component="span" fz={size} lh={size} c="text-secondary">
                  <span data-testid="scalar-period">{display.date}</span>
                  {", "}
                </Text>
              )}
              <Text component="span" fz={size} lh={size} c={changeColor}>
                {changeText}
              </Text>
              {comparisonValueDisplay != null &&
                comparisonValueDisplay !== "" && (
                  <Text component="span" fz={size} lh={size} c={changeColor}>
                    {isChanged ? (
                      <> ({comparisonValueDisplay})</>
                    ) : (
                      <> {comparisonValueDisplay}</>
                    )}
                  </Text>
                )}
            </>
          )}
        </Box>
        {!percentOnly && extraComparisonsCount > 0 && (
          <Badge
            px={6}
            size="xs"
            variant="light"
            c="text-primary"
            flex="0 0 auto"
            className={SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS}
          >
            +{extraComparisonsCount}
          </Badge>
        )}
      </Flex>
    </Tooltip>
  );
}

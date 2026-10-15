import { useEffect, useMemo, useRef } from "react";

import DashboardS from "metabase/css/dashboard.module.css";
import { Box, Stack, Text, rem } from "metabase/ui";
import { useIsTruncated } from "metabase/ui/hooks/use-is-truncated";
import { assignLazily } from "metabase/utils/merge-lazily";
import {
  ScalarCardShell,
  useScalarCardShell,
} from "metabase/visualizations/components/ScalarValue/ScalarCardShell";
import {
  ScalarValue,
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue/ScalarValue";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import {
  compactifyValue,
  estimateScalarValueWidth,
} from "metabase/visualizations/lib/scalar_utils";
import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";

import { ScalarValueContainer } from "../Scalar/ScalarValueContainer";

import { TrendComparisonList } from "./TrendComparisonList";
import { TrendComparisonRow } from "./TrendComparisonRow";
import { TrendSymbol } from "./TrendSymbol";
import { computeTrend, getComparisonDisplay } from "./compute";
import { SMART_SCALAR_CHART_DEFINITION } from "./definition";

function SmartScalarComponent(
  props: VisualizationProps & VisualizationPassThroughProps,
) {
  const {
    onVisualizationClick,
    settings,
    visualizationIsClickable,
    series,
    rawSeries,
    width,
    fontFamily,
    onRenderError,
    actionButtons,
    isQueryBuilder,
    isStandaloneQuestion,
  } = props;

  const scalarRef = useRef(null);
  const { isTruncated: isValueTruncated, ref: valueRef } =
    useIsTruncated<HTMLHeadingElement>({ ignoreHeightTruncation: true });
  const {
    tier,
    rootFontScale,
    availableWidth,
    title,
    titleElement,
    showsTitleTooltip,
    innerTooltipHoverHandlers,
  } = useScalarCardShell(props);
  const { getColor } = useBrowserRenderingContext({ fontFamily });

  const insights = rawSeries?.[0].data?.insights;
  const { trend, error } = useMemo(
    () => computeTrend(series, insights, settings, { getColor }),
    [series, insights, settings, getColor],
  );

  useEffect(() => {
    if (error) {
      onRenderError(error.message);
    }
  }, [error, onRenderError]);

  if (trend == null) {
    return null;
  }

  const { value, clicked, comparisons, display, formatOptions } = trend;

  const isClickable = onVisualizationClick != null;

  const handleClick = () => {
    if (scalarRef.current == null) {
      return;
    }

    const clickData = { ...clicked, element: scalarRef.current };

    if (
      scalarRef.current &&
      onVisualizationClick &&
      visualizationIsClickable(clickData)
    ) {
      onVisualizationClick(clickData);
    }
  };

  const isSmallestTier = !tier.showsTitle;

  const primaryComparison = comparisons[0];
  const symbolDirection =
    isSmallestTier || primaryComparison == null
      ? null
      : getComparisonDisplay(primaryComparison, formatOptions).symbolDirection;

  const symbolAllowance =
    symbolDirection != null
      ? (tier.symbolSize + tier.symbolGap) * rootFontScale
      : 0;
  const centeredValueMaxWidth = Math.max(
    width - 2 * Math.max(tier.xPadding * rootFontScale, symbolAllowance),
    0,
  );

  const { displayValue, fullScalarValue } = compactifyValue(
    value,
    centeredValueMaxWidth,
    tier.valueFontSize,
    formatOptions,
  );

  const isValueWide =
    typeof displayValue === "string" &&
    estimateScalarValueWidth(displayValue, tier.valueFontSize) >
      centeredValueMaxWidth;
  const valueMaxWidth = isValueWide
    ? Math.max(availableWidth - symbolAllowance, 0)
    : centeredValueMaxWidth;
  const valueBoxProps = {
    pos: "relative" as const,
    style: {
      maxWidth: `${valueMaxWidth}px`,
      marginLeft: isValueWide ? `${symbolAllowance}px` : undefined,
      alignSelf: isValueWide ? ("flex-start" as const) : undefined,
    },
    "data-testid": "scalar-value-box",
  };

  const hasValueTooltip = fullScalarValue !== displayValue || isValueTruncated;

  const valueElement = (
    <ScalarValueContainer
      className={DashboardS.fullscreenNormalText}
      tooltip={fullScalarValue}
      alwaysShowTooltip={hasValueTooltip}
      isClickable={isClickable}
    >
      <span onClick={handleClick} ref={scalarRef}>
        <ScalarValue
          ref={valueRef}
          fontSize={tier.valueFontSize}
          // Unjustified type cast. FIXME
          value={displayValue as string}
        />
      </span>
    </ScalarValueContainer>
  );

  const symbolElement = symbolDirection != null && (
    <Box
      pos="absolute"
      right="100%"
      top="50%"
      mr={tier.symbolGap}
      style={{ transform: "translateY(-50%)", display: "flex" }}
    >
      <TrendSymbol
        direction={symbolDirection}
        colorName={primaryComparison?.changeColorName}
        size={tier.symbolSize}
      />
    </Box>
  );

  if (isQueryBuilder || isStandaloneQuestion) {
    const hasSingleComparison = comparisons.length === 1;

    return (
      <ScalarWrapper xPadding={tier.xPadding}>
        <Stack align="center" gap="lg" maw="100%" data-testid="scalar-content">
          {hasSingleComparison ? (
            <Box {...valueBoxProps}>
              {valueElement}
              {symbolElement}
            </Box>
          ) : (
            valueElement
          )}
          {hasSingleComparison ? (
            <TrendComparisonRow
              trend={trend}
              formatOptions={formatOptions}
              size="lg"
              compactValue={false}
            />
          ) : (
            <>
              {display.date != null && display.date !== "" && (
                <Text
                  fz="lg"
                  lh="lg"
                  c="text-secondary"
                  ta="center"
                  data-testid="scalar-period"
                >
                  {display.date}
                </Text>
              )}
              {comparisons.length > 0 && (
                <TrendComparisonList
                  comparisons={comparisons}
                  formatOptions={formatOptions}
                />
              )}
            </>
          )}
        </Stack>
      </ScalarWrapper>
    );
  }

  return (
    <ScalarCardShell
      tier={tier}
      title={title}
      showsTitleTooltip={showsTitleTooltip}
      actionButtons={actionButtons}
      innerTooltipHoverHandlers={innerTooltipHoverHandlers}
    >
      <Box
        {...valueBoxProps}
        {...(hasValueTooltip ? innerTooltipHoverHandlers : {})}
      >
        {valueElement}
        {symbolElement}
      </Box>
      {titleElement}
      {comparisons.length > 0 && (
        <Box
          pos="absolute"
          top={`calc(100% + ${rem(tier.comparisonGap)})`}
          left="50%"
          // measured pixels, not a design size — must not be rem-scaled
          w={`${availableWidth}px`}
          style={{ transform: "translateX(-50%)" }}
          {...innerTooltipHoverHandlers}
        >
          <TrendComparisonRow
            trend={trend}
            formatOptions={formatOptions}
            percentOnly={isSmallestTier}
          />
        </Box>
      )}
    </ScalarCardShell>
  );
}

export const SmartScalar = assignLazily(
  SmartScalarComponent,
  SMART_SCALAR_CHART_DEFINITION,
);

import { useEffect, useMemo, useRef, useState } from "react";

import DashboardS from "metabase/css/dashboard.module.css";
import { Box, Stack, Text, Tooltip, rem } from "metabase/ui";
import {
  ScalarActionButtons,
  ScalarTitle,
  ScalarValue,
  ScalarWrapper,
  TITLE_TOOLTIP_OFFSET,
} from "metabase/visualizations/components/ScalarValue/ScalarValue";
import { getScalarSizeTier } from "metabase/visualizations/components/ScalarValue/sizing";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";
import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";

import { ScalarValueContainer } from "../Scalar/ScalarValueContainer";

import { TrendComparisonList } from "./TrendComparisonList";
import { TrendComparisonRow } from "./TrendComparisonRow";
import { TrendSymbol } from "./TrendSymbol";
import { CHANGE_TYPE_OPTIONS, computeTrend } from "./compute";
import { SMART_SCALAR_CHART_DEFINITION } from "./definition";

function SmartScalarComponent({
  onVisualizationClick,
  settings,
  visualizationIsClickable,
  series,
  rawSeries,
  width,
  height,
  fontFamily,
  onRenderError,
  showTitle,
  actionButtons,
  getHref,
  onChangeCardAndRun,
  isVisualizerCard,
  isQueryBuilder,
}: VisualizationProps & VisualizationPassThroughProps) {
  const scalarRef = useRef(null);
  const [isInnerTooltipHovered, setIsInnerTooltipHovered] = useState(false);
  const innerTooltipHoverHandlers = {
    onMouseEnter: () => setIsInnerTooltipHovered(true),
    onMouseLeave: () => setIsInnerTooltipHovered(false),
  };
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

  const tier = getScalarSizeTier(width, height);
  const isSmallestTier = !tier.showsTitle;

  const primaryComparison = comparisons[0];
  const symbolDirection = isSmallestTier
    ? null
    : (primaryComparison?.changeArrowIconName ??
      (primaryComparison?.changeType === CHANGE_TYPE_OPTIONS.SAME.CHANGE_TYPE
        ? "no_change"
        : null));

  const availableWidth = Math.max(width - tier.xPadding * 2, 0);
  const symbolAllowance =
    symbolDirection != null ? tier.symbolSize + tier.symbolGap : 0;
  const valueMaxWidth = Math.max(
    width - 2 * Math.max(tier.xPadding, symbolAllowance),
    0,
  );

  const { displayValue, fullScalarValue } = compactifyValue(
    value,
    valueMaxWidth,
    tier.valueFontSize,
    formatOptions,
  );

  const title = showTitle ? settings["card.title"] : null;
  const showsInlineTitle = Boolean(title) && tier.showsTitle;
  const showsTitleOnHover = Boolean(title) && !tier.showsTitle;

  const canSelectTitle = onChangeCardAndRun != null && !isVisualizerCard;
  const handleSelectTitle = () =>
    onChangeCardAndRun?.({ nextCard: rawSeries[0].card });

  const hasValueTooltip = fullScalarValue !== displayValue;
  // show one tooltip at a time: the title tooltip yields to the value and
  // comparison tooltips while their targets are hovered
  const showsTitleTooltip = showsTitleOnHover && !isInnerTooltipHovered;

  const valueElement = (
    <ScalarValueContainer
      className={DashboardS.fullscreenNormalText}
      tooltip={fullScalarValue}
      alwaysShowTooltip={fullScalarValue !== displayValue}
      isClickable={isClickable}
    >
      <span onClick={handleClick} ref={scalarRef}>
        <ScalarValue
          fontSize={tier.valueFontSize}
          // Unjustified type cast. FIXME
          value={displayValue as string}
        />
      </span>
    </ScalarValueContainer>
  );

  if (isQueryBuilder) {
    return (
      <ScalarWrapper xPadding={tier.xPadding}>
        <Stack align="center" gap="lg" maw="100%" data-testid="scalar-content">
          {valueElement}
          {display.date != null && display.date !== "" && (
            <Text fz="lg" lh="lg" c="text-secondary" ta="center">
              {display.date}
            </Text>
          )}
          {comparisons.length > 0 && (
            <TrendComparisonList
              comparisons={comparisons}
              formatOptions={formatOptions}
            />
          )}
        </Stack>
      </ScalarWrapper>
    );
  }

  return (
    <Tooltip
      label={title}
      disabled={!showsTitleTooltip}
      position="top"
      offset={TITLE_TOOLTIP_OFFSET}
    >
      <ScalarWrapper xPadding={tier.xPadding}>
        <ScalarActionButtons tier={tier} {...innerTooltipHoverHandlers}>
          {actionButtons}
        </ScalarActionButtons>
        <Stack
          pos="relative"
          align="center"
          gap={tier.valueTitleGap}
          maw="100%"
          data-testid="scalar-content"
        >
          <Box
            pos="relative"
            // measured pixels, not a design size — must not be rem-scaled
            maw={`${valueMaxWidth}px`}
            {...(hasValueTooltip ? innerTooltipHoverHandlers : {})}
          >
            {valueElement}
            {symbolDirection != null && (
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
            )}
          </Box>
          {showsInlineTitle && (
            <ScalarTitle
              getHref={canSelectTitle ? getHref : undefined}
              onSelectTitle={canSelectTitle ? handleSelectTitle : undefined}
            >
              {title}
            </ScalarTitle>
          )}
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
        </Stack>
      </ScalarWrapper>
    </Tooltip>
  );
}

export const SmartScalar = Object.assign(
  SmartScalarComponent,
  SMART_SCALAR_CHART_DEFINITION,
);

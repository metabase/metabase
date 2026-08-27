import { useEffect, useMemo, useRef } from "react";

import DashboardS from "metabase/css/dashboard.module.css";
import { Box, Stack, Tooltip } from "metabase/ui";
import {
  ScalarActionButtons,
  ScalarTitle,
  ScalarValue,
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue/ScalarValue";
import { getScalarSizeTier } from "metabase/visualizations/components/ScalarValue/sizing";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";
import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";

import { ScalarValueContainer } from "../Scalar/ScalarValueContainer";

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
}: VisualizationProps & VisualizationPassThroughProps) {
  const scalarRef = useRef(null);
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

  const { value, clicked, comparisons, formatOptions } = trend;

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
  const availableWidth = Math.max(width - tier.xPadding * 2, 0);

  const { displayValue, fullScalarValue } = compactifyValue(
    value,
    availableWidth,
    formatOptions,
  );

  const title = showTitle ? settings["card.title"] : null;
  const showsInlineTitle = Boolean(title) && tier.showsTitle;
  const showsTitleOnHover = Boolean(title) && !tier.showsTitle;

  const primaryComparison = comparisons[0];
  const symbolDirection =
    primaryComparison?.changeArrowIconName ??
    (primaryComparison?.changeType === CHANGE_TYPE_OPTIONS.SAME.CHANGE_TYPE
      ? "no_change"
      : null);

  return (
    <ScalarWrapper xPadding={tier.xPadding}>
      <ScalarActionButtons tier={tier}>{actionButtons}</ScalarActionButtons>
      <Tooltip label={title} disabled={!showsTitleOnHover} position="bottom">
        <Stack
          pos="relative"
          align="center"
          gap={tier.valueTitleGap}
          maw="100%"
        >
          <Box pos="relative" maw="100%">
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
          {showsInlineTitle && <ScalarTitle>{title}</ScalarTitle>}
          {comparisons.length > 0 && (
            <Box
              pos="absolute"
              top={`calc(100% + ${tier.comparisonGap}px)`}
              left="50%"
              w={availableWidth}
              style={{ transform: "translateX(-50%)" }}
            >
              <TrendComparisonRow trend={trend} formatOptions={formatOptions} />
            </Box>
          )}
        </Stack>
      </Tooltip>
    </ScalarWrapper>
  );
}

export const SmartScalar = Object.assign(
  SmartScalarComponent,
  SMART_SCALAR_CHART_DEFINITION,
);

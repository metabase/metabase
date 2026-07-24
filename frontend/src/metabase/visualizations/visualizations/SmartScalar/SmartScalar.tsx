import { useEffect, useMemo, useRef } from "react";

import DashboardS from "metabase/css/dashboard.module.css";
import { Box } from "metabase/ui";
import {
  ScalarValue,
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue/ScalarValue";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";
import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";

import { ScalarValueContainer } from "../Scalar/ScalarValueContainer";

import { PreviousValueComparison } from "./PreviousValueComparison";
import { ScalarPeriod } from "./ScalarPeriod";
import { computeTrend } from "./compute";
import { DASHCARD_HEADER_HEIGHT } from "./constants";
import { SMART_SCALAR_CHART_DEFINITION } from "./definition";
import { getValueHeight, getValueWidth, isPeriodVisible } from "./utils";

function SmartScalarComponent({
  onVisualizationClick,
  isDashboard,
  settings,
  visualizationIsClickable,
  series,
  rawSeries,
  gridSize,
  width: widthProp,
  height: heightProp,
  totalNumGridCols,
  fontFamily,
  onRenderError,
}: VisualizationProps & VisualizationPassThroughProps) {
  const scalarRef = useRef(null);
  const { getColor } = useBrowserRenderingContext({ fontFamily });

  const width = widthProp ?? 0;
  const height = heightProp ?? 0;

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

  const innerHeight = isDashboard ? height - DASHCARD_HEADER_HEIGHT : height;

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

  const { displayValue, fullScalarValue } = compactifyValue(
    value,
    width,
    formatOptions,
  );

  const { valueHeight, comparisonsCount } = getValueHeight(
    innerHeight,
    comparisons.length,
  );

  return (
    <ScalarWrapper>
      <ScalarValueContainer
        className={DashboardS.fullscreenNormalText}
        tooltip={fullScalarValue}
        alwaysShowTooltip={fullScalarValue !== displayValue}
        isClickable={isClickable}
      >
        <span onClick={handleClick} ref={scalarRef}>
          <ScalarValue
            fontFamily={fontFamily}
            gridSize={gridSize}
            height={valueHeight}
            totalNumGridCols={totalNumGridCols}
            // Unjustified type cast. FIXME
            value={displayValue as string}
            width={getValueWidth(width)}
          />
        </span>
      </ScalarValueContainer>
      {isPeriodVisible(innerHeight) && <ScalarPeriod period={display.date} />}

      {comparisonsCount === 1 && (
        <Box maw="100%" data-testid="scalar-previous-value">
          <PreviousValueComparison
            comparison={comparisons[0]}
            fontFamily={fontFamily}
            formatOptions={formatOptions}
            tooltipComparisons={comparisons}
            width={width}
          />
        </Box>
      )}

      {comparisonsCount !== 1 &&
        comparisons.map((comparison, index) => (
          <Box maw="100%" key={index} data-testid="scalar-previous-value">
            <PreviousValueComparison
              comparison={comparison}
              fontFamily={fontFamily}
              formatOptions={formatOptions}
              tooltipComparisons={[comparison]}
              width={width}
            />
          </Box>
        ))}
    </ScalarWrapper>
  );
}

export const SmartScalar = Object.assign(
  SmartScalarComponent,
  SMART_SCALAR_CHART_DEFINITION,
);

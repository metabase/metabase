import { useRef } from "react";
import _ from "underscore";

import DashboardS from "metabase/css/dashboard.module.css";
import { Stack, Text, Tooltip } from "metabase/ui";
import {
  GoalFailedState,
  GoalResolvingState,
} from "metabase/visualizations/components/GoalResolutionState";
import {
  ScalarValue,
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue/ScalarValue";
import { TransformedVisualization } from "metabase/visualizations/components/TransformedVisualization";
import { useResolvedOpenEndedGoalSegments } from "metabase/visualizations/hooks/use-resolved-goal-segments";
import {
  compactifyValue,
  getColor,
  getTooltipContent,
} from "metabase/visualizations/lib/scalar_utils";
import type {
  ComputedVisualizationSettings,
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";

import { ScalarValueContainer } from "./ScalarValueContainer";
import {
  SCALAR_CHART_DEFINITION,
  getUnresolvedSegmentsMessage,
} from "./definition";
import { scalarToBarTransform } from "./scalars-bar-transform";

const PADDING = 32;

// convert legacy `scalar.*` visualization settings to format options
function legacyScalarSettingsToFormatOptions(
  settings: ComputedVisualizationSettings,
) {
  return _.chain(settings)
    .pairs()
    .filter(([key, value]) => key.startsWith("scalar.") && value !== undefined)
    .map(([key, value]) => [key.replace(/^scalar\./, ""), value])
    .object()
    .value();
}

// Scalar visualization shows a single number; multiseries is transformed to a bar chart
function ScalarComponent(
  props: VisualizationProps & VisualizationPassThroughProps,
) {
  const scalarRef = useRef<HTMLDivElement>(null);

  const {
    className,
    series: [{ card, data }],
    settings,
    visualizationIsClickable,
    onVisualizationClick,
    height,
    width,
    gridSize,
    totalNumGridCols,
    fontFamily,
    rawSeries,
  } = props;
  const { cols, rows } = data;

  const isMultiSeries = rawSeries.length > 1;
  const goalSegments = useResolvedOpenEndedGoalSegments(
    card.dataset_query,
    data,
    isMultiSeries ? undefined : settings["scalar.segments"],
  );

  if (isMultiSeries) {
    return (
      <TransformedVisualization
        transformSeries={scalarToBarTransform}
        originalProps={props}
        VisualizationComponent={BarChart}
      />
    );
  }

  if (goalSegments.status === "resolving") {
    return <GoalResolvingState className={className} height={height} />;
  }

  if (goalSegments.status === "failed") {
    return (
      <GoalFailedState
        className={className}
        height={height}
        message={getUnresolvedSegmentsMessage()}
      />
    );
  }

  // clamp the -1 of a missing "scalar.field" to the first column
  const columnIndex = Math.max(
    0,
    cols.findIndex((col) => col.name === settings["scalar.field"]),
  );
  const value = rows[0] && rows[0][columnIndex];
  const column = cols[columnIndex];

  const formatOptions = {
    ...legacyScalarSettingsToFormatOptions(settings),
    ...settings.column?.(column),
    jsx: true,
  };

  const color = getColor(value, goalSegments.segments);
  const tooltipContent = getTooltipContent(goalSegments.segments);

  const { displayValue, fullScalarValue } = compactifyValue(
    value,
    width,
    formatOptions,
  );

  const label = settings["scalar.label"];
  const sublabel = settings["scalar.sublabel"];
  const isMetricsViewer = label !== undefined;

  const isClickable = onVisualizationClick != null && !isMetricsViewer;

  const handleClick = () => {
    const element = scalarRef.current;
    if (element == null) {
      return;
    }

    const clickData = {
      value,
      column,
      data: rows[0]?.map((value, index) => ({ value, col: cols[index] })),
      settings,
      element,
    };

    if (onVisualizationClick && visualizationIsClickable(clickData)) {
      onVisualizationClick(clickData);
    }
  };

  return (
    <ScalarWrapper>
      <ScalarValueContainer
        className={DashboardS.fullscreenNormalText}
        tooltip={fullScalarValue}
        alwaysShowTooltip={fullScalarValue !== displayValue}
        isClickable={isClickable}
      >
        <Tooltip
          label={tooltipContent}
          position="bottom"
          px="0.375rem"
          py="xs"
          disabled={!tooltipContent}
        >
          <Stack onClick={handleClick} ref={scalarRef} align="center" gap={0}>
            <ScalarValue
              color={color}
              disableHover={isMetricsViewer}
              fontFamily={fontFamily}
              gridSize={gridSize}
              height={Math.max(height - PADDING * 2, 0)}
              totalNumGridCols={totalNumGridCols}
              // Unjustified type cast. FIXME
              value={displayValue as string}
              width={Math.max(width - PADDING, 0)}
            />
            {label && (
              <Text fz="14px" lh="16px" c="text-primary" mt="md" ta="center">
                {label}
              </Text>
            )}
            {sublabel && (
              <Text fz="12px" lh="16px" c="text-secondary" mt="xs" ta="center">
                {sublabel}
              </Text>
            )}
          </Stack>
        </Tooltip>
      </ScalarValueContainer>
    </ScalarWrapper>
  );
}

export const Scalar = Object.assign(ScalarComponent, SCALAR_CHART_DEFINITION);

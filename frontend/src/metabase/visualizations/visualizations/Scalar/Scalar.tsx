import { useRef } from "react";
import _ from "underscore";

import DashboardS from "metabase/css/dashboard.module.css";
import { Stack, Text, Tooltip } from "metabase/ui";
import {
  ScalarValue,
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue/ScalarValue";
import { TransformedVisualization } from "metabase/visualizations/components/TransformedVisualization";
import {
  compactifyValue,
  getColor,
  getTooltipContent,
} from "metabase/visualizations/lib/scalar_utils";
import { segmentIsValid } from "metabase/visualizations/lib/utils";
import type {
  ComputedVisualizationSettings,
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";

import { ScalarValueContainer } from "./ScalarValueContainer";
import { SCALAR_CHART_DEFINITION } from "./definition";
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
    series: [
      {
        data: { cols, rows },
      },
    ],
    settings,
    visualizationIsClickable,
    onVisualizationClick,
    height: heightProp,
    width: widthProp,
    gridSize,
    totalNumGridCols,
    fontFamily,
    rawSeries,
  } = props;

  const width = widthProp ?? 0;
  const height = heightProp ?? 0;

  if (rawSeries.length > 1) {
    return (
      <TransformedVisualization
        transformSeries={scalarToBarTransform}
        originalProps={props}
        VisualizationComponent={BarChart}
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

  const segments = settings["scalar.segments"]?.filter((segment) =>
    segmentIsValid(segment, { allowOpenEnded: true }),
  );

  const color = getColor(value, segments);
  const tooltipContent = getTooltipContent(segments);

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

import { useRef } from "react";
import _ from "underscore";

import DashboardS from "metabase/css/dashboard.module.css";
import { Box, Stack, Text, Tooltip } from "metabase/ui";
import {
  ScalarCardShell,
  useScalarCardShell,
} from "metabase/visualizations/components/ScalarValue/ScalarCardShell";
import { ScalarValue } from "metabase/visualizations/components/ScalarValue/ScalarValue";
import { TransformedVisualization } from "metabase/visualizations/components/TransformedVisualization";
import {
  compactifyValue,
  getColor,
  getTooltipContent,
} from "metabase/visualizations/lib/scalar_utils";
import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import {
  type ComputedVisualizationSettings,
  segmentIsValid,
} from "metabase/viz-core";

import { ScalarValueContainer } from "./ScalarValueContainer";
import { SCALAR_CHART_DEFINITION } from "./definition";
import { scalarToBarTransform } from "./scalars-bar-transform";

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
    rawSeries,
    actionButtons,
  } = props;

  const label = settings["scalar.label"];
  const sublabel = settings["scalar.sublabel"];
  const isMetricsViewer = label !== undefined;

  const {
    tier,
    availableWidth,
    title,
    titleElement,
    showsTitleTooltip,
    innerTooltipHoverHandlers,
  } = useScalarCardShell(props, { hideTitle: isMetricsViewer });

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
    availableWidth,
    tier.valueFontSize,
    formatOptions,
  );

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

  const hasValueTooltip =
    fullScalarValue !== displayValue || tooltipContent != null;

  return (
    <ScalarCardShell
      tier={tier}
      title={title}
      showsTitleTooltip={showsTitleTooltip}
      actionButtons={actionButtons}
      innerTooltipHoverHandlers={innerTooltipHoverHandlers}
    >
      <Box maw="100%" {...(hasValueTooltip ? innerTooltipHoverHandlers : {})}>
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
            py="xxs"
            disabled={!tooltipContent}
          >
            <Stack onClick={handleClick} ref={scalarRef} align="center" gap={0}>
              <ScalarValue
                color={color}
                disableHover={isMetricsViewer}
                fontSize={tier.valueFontSize}
                // Unjustified type cast. FIXME
                value={displayValue as string}
              />
              {label && (
                <Text fz={14} lh="1rem" c="text-primary" mt="lg" ta="center">
                  {label}
                </Text>
              )}
              {sublabel && (
                <Text fz={12} lh="1rem" c="text-secondary" mt="xxs" ta="center">
                  {sublabel}
                </Text>
              )}
            </Stack>
          </Tooltip>
        </ScalarValueContainer>
      </Box>
      {titleElement}
    </ScalarCardShell>
  );
}

export const Scalar = Object.assign(ScalarComponent, SCALAR_CHART_DEFINITION);

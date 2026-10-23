import { useCallback, useMemo } from "react";

import { Box, Stack, Text } from "metabase/ui";
import { assignLazily } from "metabase/utils/merge-lazily";
import type {
  ClickObject,
  VisualizationProps,
} from "metabase/visualizations/types";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";
import {
  extractRemappings,
  getComputedSettingsForSeries,
  getVisualizationTransformed,
} from "metabase/viz-core";
import {
  type RawSeries,
  type RowValue,
  isCardDisplayType,
} from "metabase-types/api";

import { SMALL_MULTIPLES_DEFINITION } from "./definition";
import { getSmallMultiples } from "./utils";

const PANEL_HEIGHT_PX = 300;

/**
 * What a chart gets from `Visualization`: its series after its own
 * transform, which splits a breakout into a series per value, and the
 * settings for those series.
 */
const getChartProps = (rawSeries: RawSeries) => {
  const { series } = getVisualizationTransformed(extractRemappings(rawSeries));
  return {
    rawSeries,
    series,
    settings: getComputedSettingsForSeries(series),
  };
};

const SmallMultiplesComponent = (props: VisualizationProps) => {
  const {
    rawSeries,
    settings,
    onVisualizationClick,
    visualizationIsClickable,
  } = props;
  const columnName: unknown = settings["small_multiples.column"];
  const storedDisplay: unknown = settings["small_multiples.display"];
  const display = isCardDisplayType(storedDisplay) ? storedDisplay : "bar";

  const panels = useMemo(
    () =>
      typeof columnName === "string"
        ? getSmallMultiples(rawSeries, columnName, display)?.map(
            ({ label, value, series }) => ({
              label,
              value,
              chartProps: getChartProps(series),
            }),
          )
        : undefined,
    [rawSeries, columnName, display],
  );
  const column = rawSeries[0].data.cols.find((col) => col.name === columnName);

  const singleChartProps = useMemo(
    () =>
      getChartProps(
        rawSeries.map((single) => ({
          ...single,
          card: { ...single.card, display },
        })),
      ),
    [rawSeries, display],
  );

  // A chart's group isn't one of its dimensions, so clicks carry it here.
  const withPanel = useCallback(
    (clicked: ClickObject | null, value: RowValue): ClickObject | null =>
      clicked !== null && column !== undefined
        ? {
            ...clicked,
            dimensions: [...(clicked.dimensions ?? []), { column, value }],
          }
        : clicked,
    [column],
  );

  if (panels == null || column === undefined) {
    return <CartesianChart {...props} {...singleChartProps} />;
  }

  return (
    // Absolutely positioned so the panels add nothing to the card's height:
    // the card keeps its size and the panels scroll inside it.
    <Box flex={1} pos="relative">
      <Stack pos="absolute" inset={0} gap="lg" style={{ overflowY: "auto" }}>
        {panels.map(({ label, value, chartProps }, index) => (
          <Stack key={label} gap="xs">
            <Text fw="bold">{label}</Text>
            <Box h={PANEL_HEIGHT_PX} style={{ flexShrink: 0 }}>
              <CartesianChart
                {...props}
                {...chartProps}
                height={PANEL_HEIGHT_PX}
                showTitle={false}
                // Every chart has the same series, so one legend says it.
                hideLegend={index > 0}
                canToggleSeriesVisibility={false}
                onVisualizationClick={(clicked) =>
                  onVisualizationClick(withPanel(clicked, value))
                }
                visualizationIsClickable={(clicked) =>
                  visualizationIsClickable(withPanel(clicked, value))
                }
              />
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
};

export const SmallMultiples = assignLazily(
  SmallMultiplesComponent,
  SMALL_MULTIPLES_DEFINITION,
);

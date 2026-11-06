import { type ComponentProps, useCallback, useMemo, useState } from "react";

import { Box, Stack, Text } from "metabase/ui";
import type {
  ClickObject,
  VisualizationComponent,
} from "metabase/visualizations/types";
import {
  extractRemappings,
  getVisualizationTransformed,
} from "metabase/viz-core";
import type { RowValue } from "metabase-types/api";

import { getSmallMultiples, getSmallMultiplesColumn } from "./utils";

const PANEL_HEIGHT_PX = 300;

type SmallMultiplesLayoutProps = ComponentProps<VisualizationComponent> & {
  chart: VisualizationComponent;
};

/**
 * The card's chart, or a chart per value of the column its settings name,
 * one above another, scrolling inside the card. Every chart is the card's
 * own display with the card's settings, so its settings panel applies to
 * each, and they share colors. Clicks carry the chart's value.
 */
export const SmallMultiplesLayout = ({
  chart: Chart,
  ...props
}: SmallMultiplesLayoutProps) => {
  const {
    rawSeries,
    settings,
    hovered,
    showTitle,
    onHoverChange,
    onVisualizationClick,
    visualizationIsClickable,
  } = props;
  const columnName = getSmallMultiplesColumn(settings);
  // Split by the breakout, each chart's one series is the chart's own value,
  // which its label already says.
  const isSplitByBreakout =
    settings["graph.dimensions"]?.[1] === columnName ||
    settings["sankey.breakout"] === columnName;
  const column = rawSeries[0]?.data.cols.find((col) => col.name === columnName);
  // Only the chart being hovered shows it.
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const panels = useMemo(
    () =>
      columnName !== null
        ? getSmallMultiples(rawSeries, columnName)?.map((panel) => ({
            ...panel,
            series: getVisualizationTransformed(extractRemappings(panel.series))
              .series,
            rawSeries: panel.series,
          }))
        : undefined,
    [rawSeries, columnName],
  );

  // Each chart is drawn alone, so it doesn't split its own series again.
  const panelSettings = useMemo(
    () => ({ ...settings, "graph.split_panels": false }),
    [settings],
  );

  // A chart's value isn't one of its dimensions, so clicks carry it here.
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
    return <Chart {...props} />;
  }

  return (
    // Absolutely positioned so the charts add nothing to the card's height:
    // the card keeps its size and the charts scroll inside it.
    <Box flex={1} pos="relative">
      <Stack pos="absolute" inset={0} gap="lg" style={{ overflowY: "auto" }}>
        {panels.map((panel, index) => (
          <Stack key={panel.label} gap="xs">
            <Text fw="bold">{panel.label}</Text>
            <Box h={PANEL_HEIGHT_PX} style={{ flexShrink: 0 }}>
              <Chart
                {...props}
                rawSeries={panel.rawSeries}
                series={panel.series}
                card={panel.series[0].card}
                data={panel.series[0].data}
                settings={panelSettings}
                height={PANEL_HEIGHT_PX}
                // The card's title and actions go on the first chart only.
                showTitle={showTitle && index === 0}
                actionButtons={index === 0 ? props.actionButtons : null}
                // Every chart has the same series, so one legend says it.
                hideLegend={props.hideLegend || isSplitByBreakout || index > 0}
                canToggleSeriesVisibility={false}
                hovered={hoveredIndex === index ? hovered : null}
                onHoverChange={(object) => {
                  setHoveredIndex(index);
                  onHoverChange?.(object);
                }}
                onVisualizationClick={(clicked) =>
                  onVisualizationClick(withPanel(clicked, panel.value))
                }
                visualizationIsClickable={(clicked) =>
                  visualizationIsClickable(withPanel(clicked, panel.value))
                }
              />
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
};

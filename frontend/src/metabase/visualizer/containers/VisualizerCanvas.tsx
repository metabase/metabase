import { useDroppable } from "@dnd-kit/core";
// eslint-disable-next-line no-restricted-imports
import { ActionIcon } from "@mantine/core";
import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, Flex, Group, Icon, Title, Stack } from "metabase/ui";
import { hasAxes as checkHasAxes } from "metabase/visualizations";
import BaseVisualization from "metabase/visualizations/components/Visualization";
import type { OnChangeCardAndRun } from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { Series, VisualizationSettings } from "metabase-types/api";

import { VisualizerAxis } from "../components/VisualizerAxis";
import { DROPPABLE_CANVAS_ID } from "../dnd";

interface VisualizerCanvasProps {
  series: Series;
  onToggleVizSettings: () => void;
  onChange: (settings: VisualizationSettings) => void;
  onChangeCardAndRun: OnChangeCardAndRun;
}

export function VisualizerCanvas({
  series,
  onToggleVizSettings,
  onChange,
  onChangeCardAndRun,
}: VisualizerCanvasProps) {
  const metadata = useSelector(getMetadata);

  const { setNodeRef } = useDroppable({
    id: DROPPABLE_CANVAS_ID,
  });

  const { metrics, dimensions } = useMemo(
    () => getMetricAndDimensionOptions(series),
    [series],
  );

  const currentMetrics = getCurrentMetrics(series);
  const currentDimensions = getCurrentDimensions(series);

  const hasAxes = useMemo(() => {
    if (series.length === 0) {
      return false;
    }
    const mainSeries = { ...series[0] };
    const mainCard = mainSeries.card;
    return checkHasAxes(mainCard.display);
  }, [series]);

  const displaySeries = useMemo(() => {
    if (hasAxes) {
      const mainSeries = { ...series[0] };

      mainSeries.card = {
        ...mainSeries.card,
        visualization_settings: {
          ...mainSeries.card.visualization_settings,
          "graph.x_axis.labels_enabled": false,
          "graph.y_axis.labels_enabled": false,
        },
      };

      return [mainSeries, ...series.slice(1)];
    } else {
      return series;
    }
  }, [series, hasAxes]);

  const handleMetricsChange = (metrics: string[]) => {
    const [{ card: mainCard }] = series;
    onChange({
      ...mainCard.visualization_settings,
      "graph.metrics": metrics,
    });
  };

  const handleDimensionsChange = (dimensions: string[]) => {
    const [{ card: mainCard }] = series;
    onChange({
      ...mainCard.visualization_settings,
      "graph.dimensions": dimensions,
    });
  };

  const title = displaySeries[0].card.name;

  return (
    <Card w="100%" h="100%" ref={setNodeRef}>
      {displaySeries.length > 0 && (
        <>
          <Flex mx="xs" mb="md" align="center">
            <Title size="h2" truncate title={title}>
              {title}
            </Title>
            <Flex miw={200} ml="auto" align="center">
              <ActionIcon ml="auto" onClick={onToggleVizSettings}>
                <Icon name="gear" />
              </ActionIcon>
            </Flex>
          </Flex>
          {hasAxes ? (
            <Group w="100%" h="90%">
              <VisualizerAxis
                direction="vertical"
                columns={currentMetrics}
                columnOptions={metrics}
                onColumnsChange={handleMetricsChange}
              />
              <Stack w="90%" h="100%">
                <BaseVisualization
                  rawSeries={displaySeries}
                  metadata={metadata}
                  onChangeCardAndRun={onChangeCardAndRun}
                />
                <VisualizerAxis
                  columns={currentDimensions}
                  columnOptions={dimensions}
                  onColumnsChange={handleDimensionsChange}
                />
              </Stack>
            </Group>
          ) : (
            <div style={{ width: "100%", height: "90%" }}>
              <BaseVisualization
                rawSeries={displaySeries}
                metadata={metadata}
                onChangeCardAndRun={onChangeCardAndRun}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function getCurrentMetrics(series: Series) {
  if (series.length === 0) {
    return [];
  }
  const [{ card }] = series;
  return card.visualization_settings["graph.metrics"] ?? [];
}

function getCurrentDimensions(series: Series) {
  if (series.length === 0) {
    return [];
  }
  const [{ card }] = series;
  return card.visualization_settings["graph.dimensions"] ?? [];
}

function getMetricAndDimensionOptions(series: Series) {
  if (series.length === 0) {
    return { metrics: [], dimensions: [] };
  }

  const [{ data }] = series;

  const metrics = data.cols.filter(col => isMetric(col));
  const dimensions = data.cols.filter(
    col => isDimension(col) && !isMetric(col),
  );

  return {
    metrics: metrics.map(col => ({
      value: col.name,
      label: col.display_name,
    })),
    dimensions: dimensions.map(col => ({
      value: col.name,
      label: col.display_name,
    })),
  };
}

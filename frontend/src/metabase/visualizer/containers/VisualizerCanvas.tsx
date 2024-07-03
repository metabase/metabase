import { ActionIcon } from "@mantine/core";
import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, Flex, Group, Icon, Title, Stack } from "metabase/ui";
import { hasAxes as checkHasAxes } from "metabase/visualizations";
import BaseVisualization from "metabase/visualizations/components/Visualization";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { Series } from "metabase-types/api";

import { VisualizerAxis } from "../components/VisualizerAxis";
import { useVizSettings } from "../useVizSettings";

interface VisualizerCanvasProps {
  series: Series;
  onChange: (series: Series) => void;
}

export function VisualizerCanvas({ series, onChange }: VisualizerCanvasProps) {
  const { openVizSettings } = useVizSettings();
  const metadata = useSelector(getMetadata);

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
    const mainSeries = { ...series[0] };
    mainSeries.card = {
      ...mainSeries.card,
      visualization_settings: {
        ...mainSeries.card.visualization_settings,
        "graph.metrics": metrics,
      },
    };
    onChange([mainSeries, ...series.slice(1)]);
  };

  const handleDimensionsChange = (dimensions: string[]) => {
    const mainSeries = { ...series[0] };
    mainSeries.card = {
      ...mainSeries.card,
      visualization_settings: {
        ...mainSeries.card.visualization_settings,
        "graph.dimensions": dimensions,
      },
    };
    onChange([mainSeries, ...series.slice(1)]);
  };

  return (
    <Card w="100%" h="100%">
      {displaySeries.length > 0 && (
        <>
          <Flex mx="xs" mb="md">
            <Title>{displaySeries[0].card.name}</Title>
            <ActionIcon ml="auto" onClick={() => openVizSettings()}>
              <Icon name="gear" />
            </ActionIcon>
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
                // isDashboard flag makes it use the TableSimple component
                // TableInteractive does a lot of work with Question and Metadata
                // and it's currently crashing
                isDashboard={series[0].card.display === "table"}
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

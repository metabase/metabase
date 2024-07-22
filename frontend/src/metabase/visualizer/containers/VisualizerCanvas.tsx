import { useDroppable } from "@dnd-kit/core";
// eslint-disable-next-line no-restricted-imports
import { ActionIcon, Chip } from "@mantine/core";
import { assocIn } from "icepick";
import { useMemo, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Card,
  Flex,
  Group,
  Icon,
  Title,
  Stack,
  type IconName,
} from "metabase/ui";
import BaseVisualization from "metabase/visualizations/components/Visualization";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import type {
  ComputedVisualizationSettings,
  OnChangeCardAndRun,
} from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { Series, VisualizationSettings } from "metabase-types/api";

import { VisualizerAxis } from "../components/VisualizerAxis";
import { VizTypePicker } from "../components/VizTypePicker";
import { DROPPABLE_CANVAS_ID } from "../dnd";
import { isCartesianSeries } from "../utils";

interface VisualizerCanvasProps {
  series: Series;
  transformedSeries: Series; // TODO Rename into series + rawSeries?
  settings: ComputedVisualizationSettings;
  vizType: string;
  onToggleVizSettings: () => void;
  onVizTypeChange: (vizType: string) => void;
  onChange: (settings: VisualizationSettings) => void;
  onChangeCardAndRun: OnChangeCardAndRun;
}

export function VisualizerCanvas({
  series,
  transformedSeries,
  settings,
  vizType,
  onToggleVizSettings,
  onVizTypeChange,
  onChange,
  onChangeCardAndRun,
}: VisualizerCanvasProps) {
  const [isYAxisPanelVisible, setYAxisPanelVisible] = useState(false);
  const metadata = useSelector(getMetadata);

  const { setNodeRef } = useDroppable({
    id: DROPPABLE_CANVAS_ID,
  });

  const { metrics, dimensions } = useMemo(
    () => getMetricAndDimensionOptions(series),
    [series],
  );

  const hasData = series.length > 0;

  const currentMetrics = settings?.["graph.metrics"] ?? [];
  const currentDimensions = settings?.["graph.dimensions"] ?? [];

  const hasAxes = isCartesianSeries(series, settings);

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

  const handleMetricLabelChange = (metricColumn: string, label: string) => {
    const [{ card: mainCard }] = series;
    if (currentMetrics.length === 1) {
      onChange({
        ...mainCard.visualization_settings,
        "graph.y_axis.title_text": label,
      });
    }
  };

  const handleSeriesNameChange = (seriesIndex: number, name: string) => {
    const [{ card: mainCard }] = series;
    const editedSeries = transformedSeries[seriesIndex];
    const seriesKey = keyForSingleSeries(editedSeries);
    if (seriesKey && name.length > 0) {
      const nextSettings = assocIn(
        mainCard.visualization_settings,
        ["series_settings", seriesKey, "title"],
        name,
      );
      onChange(nextSettings);
    }
  };

  const handleDimensionsChange = (dimensions: string[]) => {
    const [{ card: mainCard }] = series;
    onChange({
      ...mainCard.visualization_settings,
      "graph.dimensions": dimensions,
    });
  };

  const handleDimensionLabelChange = (
    dimensionColumn: string,
    label: string,
  ) => {
    const [{ card: mainCard }] = series;
    if (currentDimensions.length === 1) {
      onChange({
        ...mainCard.visualization_settings,
        "graph.x_axis.title_text": label,
      });
    }
  };

  const title = displaySeries.length > 0 ? displaySeries[0].card.name : "";

  const renderChart = () => {
    if (hasAxes) {
      return (
        <Group pos="relative" w="100%" h="90%">
          <VisualizerAxis
            direction="vertical"
            columns={currentMetrics}
            columnOptions={metrics}
            settings={settings}
            onColumnsChange={handleMetricsChange}
            onLabelChange={handleMetricLabelChange}
            onMouseEnter={() => setYAxisPanelVisible(true)}
          />
          <Stack w="90%" h="100%">
            <BaseVisualization
              rawSeries={displaySeries}
              metadata={metadata}
              onChangeSeriesName={handleSeriesNameChange}
              onChangeCardAndRun={onChangeCardAndRun}
            />
            <VisualizerAxis
              columns={currentDimensions}
              columnOptions={dimensions}
              settings={settings}
              onColumnsChange={handleDimensionsChange}
              onLabelChange={handleDimensionLabelChange}
            />
          </Stack>
          <YAxisPanel
            isVisible={isYAxisPanelVisible}
            columns={currentMetrics}
            columnOptions={metrics}
            onColumnsChange={handleMetricsChange}
            onClose={() => setYAxisPanelVisible(false)}
          />
        </Group>
      );
    }
    return (
      <div style={{ width: "100%", height: "90%" }}>
        <BaseVisualization
          rawSeries={displaySeries}
          metadata={metadata}
          onChangeCardAndRun={onChangeCardAndRun}
        />
      </div>
    );
  };

  return (
    <Card w="100%" h="100%" ref={setNodeRef}>
      <Flex mx="xs" mb="md" align="center">
        <Flex gap="xs">
          {hasData && (
            <VizTypePicker
              value={vizType as IconName}
              onChange={onVizTypeChange}
            />
          )}
          {hasData && (
            <Title size="h2" truncate title={title}>
              {title}
            </Title>
          )}
        </Flex>
        {hasData && (
          <Flex miw={200} ml="auto" align="center">
            <ActionIcon ml="auto" onClick={onToggleVizSettings}>
              <Icon name="gear" />
            </ActionIcon>
          </Flex>
        )}
      </Flex>
      {hasData && renderChart()}
    </Card>
  );
}

interface YAxisPanelProps {
  isVisible: boolean;
  columns: string[];
  columnOptions: Array<{ label: string; value: string }>;
  onColumnsChange: (columns: string[]) => void;
  onClose: () => void;
}

function YAxisPanel({
  isVisible,
  columns,
  columnOptions,
  onColumnsChange,
  onClose,
}: YAxisPanelProps) {
  const handleToggleColumn = (column: string) => {
    if (columns.includes(column)) {
      onColumnsChange(columns.filter(c => c !== column));
    } else {
      onColumnsChange([...columns, column]);
    }
  };

  return (
    <Card
      pos="absolute"
      left={0}
      top={0}
      h="100%"
      w="16rem"
      bg="bg-medium"
      shadow="md"
      onMouseLeave={onClose}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateX(0)" : "translateX(-16rem)",
        transition: "transform 0.3s ease-out, opacity 0.3s ease-out",
      }}
    >
      <Stack spacing="xs" p="md">
        {columnOptions.map(option => (
          <Chip
            key={option.value}
            checked={columns.includes(option.value)}
            variant="outline"
            radius="sm"
            onChange={() => handleToggleColumn(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </Stack>
    </Card>
  );
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

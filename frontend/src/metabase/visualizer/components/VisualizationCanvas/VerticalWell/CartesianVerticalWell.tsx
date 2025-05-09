import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Flex, Text } from "metabase/ui";
import { getDefaultMetricFilter } from "metabase/visualizations/shared/settings/cartesian-chart";
import { DRAGGABLE_ID, DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getIsMultiseriesCartesianChart,
  getVisualizationType,
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
  getVisualizerRawSettings,
} from "metabase/visualizer/selectors";
import { isDraggedColumnItem } from "metabase/visualizer/utils";
import { removeColumn } from "metabase/visualizer/visualizer.slice";
import type { DatasetColumn } from "metabase-types/api";

import { WellItem } from "../WellItem";

import { SimpleVerticalWell } from "./SimpleVerticalWell";

export function CartesianVerticalWell() {
  const display = useSelector(getVisualizationType);
  const rawSettings = useSelector(getVisualizerRawSettings);
  const computedSettings = useSelector(getVisualizerComputedSettings);
  const columns = useSelector(getVisualizerDatasetColumns);
  const isMultiseries = useSelector(getIsMultiseriesCartesianChart);
  const dispatch = useDispatch();

  const { active, isOver, setNodeRef } = useDroppable({
    id: DROPPABLE_ID.Y_AXIS_WELL,
  });

  const metrics = useMemo(() => {
    const settings = isMultiseries ? rawSettings : computedSettings;
    const metricNames = settings["graph.metrics"] ?? [];
    return metricNames
      .map((name) => columns.find((column) => column.name === name))
      .filter(isNotNull);
  }, [columns, computedSettings, rawSettings, isMultiseries]);

  const canHandleActiveItem = useMemo(() => {
    if (!display || !active || !isDraggedColumnItem(active)) {
      return false;
    }
    const { column } = active.data.current;
    const isSuitableColumn = getDefaultMetricFilter(display);
    const a = isSuitableColumn(column);

    return a;
  }, [active, display]);

  const handleRemoveMetric = (metric: DatasetColumn) => {
    dispatch(removeColumn({ name: metric.name }));
  };

  return (
    <SimpleVerticalWell
      hasValues={metrics.length > 1}
      isHighlighted={canHandleActiveItem}
      isOver={isOver}
      ref={setNodeRef}
    >
      <Flex
        align="center"
        pos="relative"
        gap="sm"
        style={{
          height: "100%",
          overflow: "auto",
          writingMode: "sideways-lr",
        }}
      >
        {metrics.map((metric) => (
          <MetricWellItem
            key={metric.name}
            metric={metric}
            onRemove={() => handleRemoveMetric(metric)}
          />
        ))}
      </Flex>
    </SimpleVerticalWell>
  );
}

interface MetricWellItemProps {
  metric: DatasetColumn;
  onRemove: () => void;
}

function MetricWellItem({ metric, onRemove }: MetricWellItemProps) {
  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id: `${DROPPABLE_ID.Y_AXIS_WELL}:${DRAGGABLE_ID.WELL_ITEM}:${metric.name}`,
    data: {
      type: DRAGGABLE_ID.WELL_ITEM,
      wellId: DROPPABLE_ID.Y_AXIS_WELL,
      column: metric,
    },
  });

  return (
    <WellItem
      {...attributes}
      {...listeners}
      style={{ visibility: isDragging ? "hidden" : "visible" }}
      onRemove={onRemove}
      ref={setNodeRef}
    >
      <Text truncate>{metric.display_name}</Text>
    </WellItem>
  );
}

import { useDraggable } from "@dnd-kit/core";
import { useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Flex, Text } from "metabase/ui";
import { DRAGGABLE_ID, DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { removeColumn } from "metabase/visualizer/visualizer.slice";
import type { DatasetColumn } from "metabase-types/api";

import { WellItem } from "../WellItem";

import { SimpleVerticalWell } from "./SimpleVerticalWell";

export function CartesianVerticalWell() {
  const settings = useSelector(getVisualizerComputedSettings);
  const columns = useSelector(getVisualizerDatasetColumns);
  const dispatch = useDispatch();

  const metrics = useMemo(() => {
    const metricNames = settings["graph.metrics"] ?? [];
    return metricNames
      .map(name => columns.find(column => column.name === name))
      .filter(isNotNull);
  }, [columns, settings]);

  const handleRemoveMetric = (metric: DatasetColumn) => {
    dispatch(removeColumn({ name: metric.name }));
  };

  return (
    <SimpleVerticalWell hasValues={metrics.length > 1}>
      <Flex
        align="center"
        justify="center"
        pos="relative"
        gap="sm"
        style={{ transform: "rotate(-90deg)" }}
      >
        {metrics.map(metric => (
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

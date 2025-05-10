import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Flex, type FlexProps, Text } from "metabase/ui";
import { getDefaultDimensionFilter } from "metabase/visualizations/shared/settings/cartesian-chart";
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
import { isDate, isString } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

import { WellItem } from "../WellItem";

export function CartesianHorizontalWell({ style, ...props }: FlexProps) {
  const display = useSelector(getVisualizationType);
  const rawSettings = useSelector(getVisualizerRawSettings);
  const computedSettings = useSelector(getVisualizerComputedSettings);
  const columns = useSelector(getVisualizerDatasetColumns);
  const isMultiseries = useSelector(getIsMultiseriesCartesianChart);
  const dispatch = useDispatch();

  const { active, setNodeRef, isOver } = useDroppable({
    id: DROPPABLE_ID.X_AXIS_WELL,
  });

  const allDimensions = useMemo(() => {
    const settings = isMultiseries ? rawSettings : computedSettings;
    const dimensionNames = settings["graph.dimensions"] ?? [];
    return dimensionNames
      .map((name) => columns.find((column) => column.name === name))
      .filter(isNotNull);
  }, [columns, computedSettings, rawSettings, isMultiseries]);

  const dimensions = useMemo(() => {
    if (!isMultiseries) {
      return allDimensions;
    }

    const dimensions: DatasetColumn[] = [];
    const timeDimensions = allDimensions.filter(isDate);
    const categoryDimensions = allDimensions.filter(isString);

    // Show only one dimension for multiseries charts,
    // as they have to be added/removed together, not individually
    if (timeDimensions.length > 0) {
      dimensions.push(timeDimensions[0]);
    }
    if (categoryDimensions.length > 0) {
      dimensions.push(categoryDimensions[0]);
    }

    return dimensions;
  }, [allDimensions, isMultiseries]);

  const canHandleActiveItem = useMemo(() => {
    if (!display || !active || !isDraggedColumnItem(active)) {
      return false;
    }
    const { column } = active.data.current;
    const isSuitableColumn = getDefaultDimensionFilter(display);
    return isSuitableColumn(column);
  }, [active, display]);

  const handleRemoveDimension = (dimension: DatasetColumn) => {
    dispatch(removeColumn({ name: dimension.name }));
  };

  const borderColor = canHandleActiveItem
    ? "var(--mb-color-brand)"
    : "var(--border-color)";

  return (
    <Flex
      {...props}
      bg={canHandleActiveItem ? "var(--mb-color-brand-light)" : "bg-light"}
      p="sm"
      wrap="nowrap"
      gap="sm"
      style={{
        ...style,
        height: "100%",
        overflowX: "auto",
        overflowY: "hidden",
        borderRadius: "var(--border-radius-xl)",
        border: `1px solid ${borderColor}`,
        transform: canHandleActiveItem ? "scale(1.025)" : "scale(1)",
        transition:
          "transform 0.2s ease-in-out 0.2s, border-color 0.2s ease-in-out 0.2s, background 0.2s ease-in-out 0.2s",
        outline:
          isOver && canHandleActiveItem
            ? "1px solid var(--mb-color-brand)"
            : "none",
      }}
      ref={setNodeRef}
    >
      {dimensions.map((dimension) => (
        <DimensionWellItem
          key={dimension.name}
          dimension={dimension}
          onRemove={() => handleRemoveDimension(dimension)}
        />
      ))}
    </Flex>
  );
}

interface DimensionWellItemProps {
  dimension: DatasetColumn;
  onRemove: () => void;
}

function DimensionWellItem({ dimension, onRemove }: DimensionWellItemProps) {
  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id: `${DROPPABLE_ID.X_AXIS_WELL}:${DRAGGABLE_ID.WELL_ITEM}:${dimension.name}`,
    data: {
      type: DRAGGABLE_ID.WELL_ITEM,
      wellId: DROPPABLE_ID.X_AXIS_WELL,
      column: dimension,
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
      <Text truncate>{dimension.display_name}</Text>
    </WellItem>
  );
}

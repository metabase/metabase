import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Flex, type FlexProps, Text } from "metabase/ui";
import { DRAGGABLE_ID, DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/visualizer.slice";
import type { DatasetColumn } from "metabase-types/api";

import { WellItem } from "../WellItem";

export function CartesianHorizontalWell({ style, ...props }: FlexProps) {
  const settings = useSelector(getSettings);
  const columns = useSelector(getVisualizerDatasetColumns);

  const { active, setNodeRef, isOver } = useDroppable({
    id: DROPPABLE_ID.X_AXIS_WELL,
  });

  const dimensions = useMemo(() => {
    const dimensionNames = settings["graph.dimensions"] ?? [];
    return dimensionNames
      .map(name => columns.find(column => column.name === name))
      .filter(isNotNull);
  }, [columns, settings]);

  return (
    <Flex
      {...props}
      bg={active ? "var(--mb-color-brand-light)" : "bg-light"}
      p="sm"
      wrap="nowrap"
      gap="sm"
      style={{
        ...style,
        overflowX: "auto",
        overflowY: "hidden",
        borderRadius: "var(--border-radius-xl)",
        border: `1px solid ${active ? "var(--mb-color-brand)" : "var(--border-color)"}`,
        transform: active ? "scale(1.025)" : "scale(1)",
        transition:
          "transform 0.2s ease-in-out 0.2s, border-color 0.2s ease-in-out 0.2s, background 0.2s ease-in-out 0.2s",
        outline: isOver ? "1px solid var(--mb-color-brand)" : "none",
      }}
      maw="80%"
      ref={setNodeRef}
    >
      {dimensions.map(dimension => (
        <DimensionWellItem key={dimension.name} dimension={dimension} />
      ))}
    </Flex>
  );
}

interface DimensionWellItemProps {
  dimension: DatasetColumn;
}

function DimensionWellItem({ dimension }: DimensionWellItemProps) {
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
      ref={setNodeRef}
    >
      <Text truncate>{dimension.display_name}</Text>
    </WellItem>
  );
}

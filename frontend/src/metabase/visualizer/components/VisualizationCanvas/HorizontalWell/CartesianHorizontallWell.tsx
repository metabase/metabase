import { useDroppable } from "@dnd-kit/core";
import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Flex, type FlexProps, Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import { getVisualizerDatasetColumns } from "metabase/visualizer/visualizer.slice";

import { WellItem } from "../WellItem";

interface CartesianHorizontalWellProps extends FlexProps {
  settings: ComputedVisualizationSettings;
}

export function CartesianHorizontalWell({
  settings,
  style,
  ...props
}: CartesianHorizontalWellProps) {
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
        <WellItem key={dimension.name}>
          <Text truncate>{dimension.display_name}</Text>
        </WellItem>
      ))}
    </Flex>
  );
}

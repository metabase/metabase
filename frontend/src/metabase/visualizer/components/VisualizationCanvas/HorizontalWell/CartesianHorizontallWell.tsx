import { useDroppable } from "@dnd-kit/core";

import { useSelector } from "metabase/lib/redux";
import { Flex, type FlexProps, Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { DROPPABLE_ID } from "metabase/visualizer/dnd/constants";
import { getVisualizerDimensionColumn } from "metabase/visualizer/visualizer.slice";

import { WellItem } from "../WellItem";

interface CartesianHorizontalWellProps extends FlexProps {
  settings: ComputedVisualizationSettings;
}

export function CartesianHorizontalWell({
  settings,
  style,
  ...props
}: CartesianHorizontalWellProps) {
  const dimension = useSelector(getVisualizerDimensionColumn);

  const { active, setNodeRef, isOver } = useDroppable({
    id: DROPPABLE_ID.X_AXIS_WELL,
  });

  return (
    <Flex
      {...props}
      bg={active ? "var(--mb-color-brand-light)" : "bg-light"}
      p="sm"
      wrap="nowrap"
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
      <WellItem>
        <Text truncate>{dimension.column.display_name}</Text>
      </WellItem>
    </Flex>
  );
}

import { useDroppable } from "@dnd-kit/core";

import { Flex, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";

import { WellItem } from "../WellItem";

interface SimpleVerticalWellProps {
  name?: string;
}

export function SimpleVerticalWell({ name }: SimpleVerticalWellProps) {
  const { active, isOver, setNodeRef } = useDroppable({
    id: DROPPABLE_ID.Y_AXIS_WELL,
  });

  const borderStyle = name ? "solid" : "dashed";
  const borderColor = active ? "var(--mb-color-brand)" : "var(--border-color)";

  return (
    <Flex
      h="100%"
      pos="relative"
      align="center"
      justify="center"
      bg={active ? "var(--mb-color-brand-light)" : "bg-light"}
      p="md"
      wrap="nowrap"
      style={{
        borderRadius: "var(--border-radius-xl)",
        border: `1px ${borderStyle} ${borderColor}`,
        transform: active ? "scale(1.025)" : "scale(1)",
        transition:
          "transform 0.2s ease-in-out 0.2s, border-color 0.2s ease-in-out 0.2s, background 0.2s ease-in-out 0.2s",
        outline: isOver ? "1px solid var(--mb-color-brand)" : "none",
      }}
      ref={setNodeRef}
    >
      <WellItem style={{ position: "absolute", transform: "rotate(-90deg)" }}>
        <Text truncate>{name ?? "Metric"}</Text>
      </WellItem>
    </Flex>
  );
}

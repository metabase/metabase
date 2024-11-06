import { useDroppable } from "@dnd-kit/core";

import { Flex, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/dnd/constants";

import { WellItem } from "../WellItem";

interface SimpleVerticalWellProps {
  name: string;
}

export function SimpleVerticalWell({ name }: SimpleVerticalWellProps) {
  const { setNodeRef } = useDroppable({ id: DROPPABLE_ID.Y_AXIS_WELL });

  return (
    <Flex
      h="100%"
      pos="relative"
      align="center"
      justify="center"
      bg="var(--mb-color-bg-light)"
      p="md"
      wrap="nowrap"
      style={{
        borderRadius: "var(--border-radius-xl)",
        border: `1px solid var(--mb-color-border)`,
      }}
      ref={setNodeRef}
    >
      <WellItem style={{ position: "absolute", transform: "rotate(-90deg)" }}>
        <Text truncate>{name}</Text>
      </WellItem>
    </Flex>
  );
}

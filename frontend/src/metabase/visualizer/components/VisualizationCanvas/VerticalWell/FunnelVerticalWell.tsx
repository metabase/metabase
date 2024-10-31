import { useDroppable } from "@dnd-kit/core";

import { Flex, Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { DROPPABLE_ID } from "metabase/visualizer/dnd/constants";

import { WellItem } from "../WellItem";

interface FunnelVerticalWellProps {
  settings: ComputedVisualizationSettings;
}

export function FunnelVerticalWell({ settings }: FunnelVerticalWellProps) {
  const { setNodeRef } = useDroppable({ id: DROPPABLE_ID.Y_AXIS_WELL });

  const metric = settings["funnel.metric"];

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
      <WellItem>
        <Text truncate>{metric}</Text>
      </WellItem>
    </Flex>
  );
}

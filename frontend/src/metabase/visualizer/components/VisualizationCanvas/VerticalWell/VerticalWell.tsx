import { useDroppable } from "@dnd-kit/core";

import { Box, type BoxProps, Flex, type FlexProps, Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { DROPPABLE_ID } from "metabase/visualizer/dnd/constants";
import type {
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

interface VerticalWellProps extends FlexProps {
  display: VisualizationDisplay;
  settings: ComputedVisualizationSettings;
  onChangeSettings: (settings: VisualizationSettings) => void;
}

export function VerticalWell({
  display,
  settings,
  style,
  ...props
}: VerticalWellProps) {
  const { setNodeRef } = useDroppable({ id: DROPPABLE_ID.VERTICAL_WELL });

  if (display !== "funnel") {
    return null;
  }

  const metric = settings["funnel.metric"];

  return (
    <Flex
      {...props}
      h="100%"
      pos="relative"
      align="center"
      justify="center"
      bg="var(--mb-color-text-light)"
      p="md"
      wrap="nowrap"
      style={{
        ...style,
        borderRadius: "var(--default-border-radius)",
      }}
      ref={setNodeRef}
    >
      <WellItem>
        <Text truncate>{metric}</Text>
      </WellItem>
    </Flex>
  );
}

function WellItem(props: BoxProps) {
  return (
    <Box
      {...props}
      bg="var(--mb-color-bg-white)"
      px="sm"
      style={{
        position: "absolute",
        transform: "rotate(-90deg)",
        borderRadius: "var(--default-border-radius)",
      }}
    />
  );
}

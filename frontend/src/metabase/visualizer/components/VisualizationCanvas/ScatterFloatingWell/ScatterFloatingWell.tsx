import { useDroppable } from "@dnd-kit/core";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Stack, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/visualizer.slice";

import { WellItem } from "../WellItem";

export function ScatterFloatingWell() {
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getSettings);

  const { isOver, setNodeRef } = useDroppable({
    id: DROPPABLE_ID.SCATTER_BUBBLE_SIZE_WELL,
  });

  const bubbleSize = columns.find(
    col => col.name === settings["scatter.bubble"],
  );

  return (
    <Stack
      pos="absolute"
      top="1rem"
      right="1rem"
      p="md"
      bg="bg-medium"
      style={{
        borderRadius: "var(--default-border-radius)",
        outline: isOver ? "1px solid var(--mb-color-brand)" : "none",
      }}
    >
      <WellItem ref={setNodeRef}>
        <Text truncate>
          {bubbleSize
            ? t`Bubble size` + `: ${bubbleSize.display_name}`
            : t`Bubble size`}
        </Text>
      </WellItem>
    </Stack>
  );
}

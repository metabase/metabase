import { useDroppable } from "@dnd-kit/core";
import { useMemo } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Stack, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { isDraggedColumnItem } from "metabase/visualizer/utils";
import { isNumber } from "metabase-lib/v1/types/utils/isa";

import { WellItem } from "../WellItem";

export function ScatterFloatingWell() {
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);

  const { active, isOver, setNodeRef } = useDroppable({
    id: DROPPABLE_ID.SCATTER_BUBBLE_SIZE_WELL,
  });

  const canHandleActiveItem = useMemo(() => {
    if (!active || !isDraggedColumnItem(active)) {
      return false;
    }
    const { column } = active.data.current;
    return isNumber(column);
  }, [active]);

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
        outline:
          isOver && canHandleActiveItem
            ? "1px solid var(--mb-color-brand)"
            : "none",
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

import { useDroppable } from "@dnd-kit/core";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { isDraggedColumnItem } from "metabase/visualizer/utils";
import { removeColumn } from "metabase/visualizer/visualizer.slice";
import { isNumber } from "metabase-lib/v1/types/utils/isa";

import { WellItem } from "../WellItem";

export function ScatterFloatingWell() {
  const dispatch = useDispatch();

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
    (col) => col.name === settings["scatter.bubble"],
  );

  const handleRemove = useCallback(() => {
    if (!bubbleSize) {
      return;
    }

    dispatch(removeColumn({ name: bubbleSize.name, well: "bubble" }));
  }, [bubbleSize, dispatch]);

  return (
    <Box
      p="md"
      bg="bg-medium"
      style={{
        borderRadius: "var(--default-border-radius)",
        outline:
          isOver && canHandleActiveItem
            ? "1px solid var(--mb-color-brand)"
            : "none",
      }}
      ref={setNodeRef}
    >
      {bubbleSize ? (
        <WellItem onRemove={handleRemove}>
          <Text truncate>
            {t`Bubble size` + `: ${bubbleSize.display_name}`}
          </Text>
        </WellItem>
      ) : (
        <Text c="text-light" ta="center">{t`Bubble size`}</Text>
      )}
    </Box>
  );
}

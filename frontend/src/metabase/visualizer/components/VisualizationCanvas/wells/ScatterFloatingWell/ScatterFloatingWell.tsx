import { useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import { useCanHandleActiveItem } from "metabase/visualizer/hooks/use-can-handle-active-item";
import {
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { removeColumn } from "metabase/visualizer/visualizer.slice";
import { isNumber } from "metabase-lib/v1/types/utils/isa";

import { WellItem } from "../WellItem";
import S from "../well.module.css";

export function ScatterFloatingWell() {
  const dispatch = useDispatch();

  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);

  const { active, isOver, setNodeRef } = useDroppable({
    id: DROPPABLE_ID.SCATTER_BUBBLE_SIZE_WELL,
  });

  const canHandleActiveItem = useCanHandleActiveItem({
    active,
    isSuitableColumn: isNumber,
  });

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
      className={cx(S.Well, {
        [S.isOver]: isOver,
        [S.isActive]: canHandleActiveItem,
      })}
      ref={setNodeRef}
    >
      {bubbleSize ? (
        <WellItem onRemove={handleRemove}>
          <Text truncate>
            {t`Bubble size` + `: ${bubbleSize.display_name}`}
          </Text>
        </WellItem>
      ) : (
        <Text c="text-tertiary" ta="center">{t`Bubble size`}</Text>
      )}
    </Box>
  );
}

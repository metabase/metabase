import { useDroppable } from "@dnd-kit/core";
import cx from "classnames";
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
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import { isNumber } from "metabase-lib/v1/types/utils/isa";

import { WellItem } from "./WellItem";
import S from "./well.module.css";

export function TooltipExtraMetricsFloatingWell() {
  const dispatch = useDispatch();

  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);

  const { active, isOver, setNodeRef } = useDroppable({
    id: DROPPABLE_ID.TOOLTIP_EXTRA_METRICS_WELL,
  });

  const canHandleActiveItem = useCanHandleActiveItem({
    active,
    isSuitableColumn: isNumber,
  });

  const tooltipColumns = columns.filter(
    (col) =>
      settings["graph.tooltip_columns"]?.includes(
        getColumnKey({ name: col.name }),
      ) || false,
  );

  const handleRemove = (name: string) => {
    if (!tooltipColumns) {
      return;
    }

    dispatch(removeColumn({ name: name, well: "all" }));
  };

  return (
    <Box
      className={cx(S.Well, {
        [S.isOver]: isOver,
        [S.isActive]: canHandleActiveItem,
      })}
      ref={setNodeRef}
    >
      {tooltipColumns.length ? (
        tooltipColumns.map((columnItem) => (
          <WellItem
            key={columnItem.id}
            onRemove={() => handleRemove(columnItem.name)}
          >
            <Text truncate>{t`Tooltip` + `: ${columnItem.display_name}`}</Text>
          </WellItem>
        ))
      ) : (
        <Text c="text-light" ta="center">{t`Additional tooltip columns`}</Text>
      )}
    </Box>
  );
}

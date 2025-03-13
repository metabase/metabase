import { useDroppable } from "@dnd-kit/core";
import { useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Flex, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { isDraggedColumnItem } from "metabase/visualizer/utils";
import { removeColumn } from "metabase/visualizer/visualizer.slice";
import { isMetric } from "metabase-lib/v1/types/utils/isa";

import { WellItem } from "../WellItem";

import { SimpleVerticalWell } from "./SimpleVerticalWell";

export function FunnelVerticalWell() {
  const settings = useSelector(getVisualizerComputedSettings);
  const columns = useSelector(getVisualizerDatasetColumns);
  const dispatch = useDispatch();

  const { active, isOver, setNodeRef } = useDroppable({
    id: DROPPABLE_ID.Y_AXIS_WELL,
  });

  const metric = columns.find(
    column => column.name === settings["funnel.metric"],
  );

  const isHighlighted = useMemo(() => {
    if (!active || !isDraggedColumnItem(active)) {
      return false;
    }
    const { column } = active.data.current;
    return isMetric(column);
  }, [active]);

  const handleRemoveMetric = () => {
    if (metric) {
      dispatch(removeColumn({ name: metric.name }));
    }
  };

  return (
    <SimpleVerticalWell
      hasValues={!!metric}
      isHighlighted={isHighlighted}
      isOver={isOver}
      ref={setNodeRef}
    >
      <Flex
        align="center"
        pos="relative"
        gap="sm"
        style={{
          height: "100%",
          overflow: "auto",
          writingMode: "sideways-lr",
        }}
      >
        {!!metric && (
          <WellItem
            onRemove={handleRemoveMetric}
            style={{ position: "absolute", transform: "rotate(-90deg)" }}
          >
            <Text truncate>{metric.display_name}</Text>
          </WellItem>
        )}
      </Flex>
    </SimpleVerticalWell>
  );
}

import { useDroppable } from "@dnd-kit/core";
import { useMemo } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Stack, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { isDraggedColumnItem } from "metabase/visualizer/utils";
import { removeColumn } from "metabase/visualizer/visualizer.slice";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

import { WellItem } from "../WellItem";

import { WellBox } from "./WellBox";

export function PieVerticalWell() {
  return (
    <Box>
      <PieMetricWell />
      <PieDimensionWell />
    </Box>
  );
}

function PieMetricWell() {
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const { active, isOver, setNodeRef } = useDroppable({
    id: DROPPABLE_ID.PIE_METRIC,
  });

  const metric = columns.find(col => col.name === settings["pie.metric"]);

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
    <Box mt="lg">
      <Text>{t`Metric`}</Text>
      <WellBox isHighlighted={isHighlighted} isOver={isOver} ref={setNodeRef}>
        <Stack>
          {metric && (
            <WellItem onRemove={metric && handleRemoveMetric}>
              <Ellipsified style={{ flex: 1 }}>
                {metric.display_name}
              </Ellipsified>
            </WellItem>
          )}
        </Stack>
      </WellBox>
    </Box>
  );
}

function PieDimensionWell() {
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const { isOver, setNodeRef, active } = useDroppable({
    id: DROPPABLE_ID.PIE_DIMENSION,
  });

  const isHighlighted = useMemo(() => {
    if (!active || !isDraggedColumnItem(active)) {
      return false;
    }
    const { column } = active.data.current;
    return isDimension(column);
  }, [active]);

  const dimensions = columns.filter(col =>
    (settings["pie.dimension"] ?? []).includes(col.name),
  );

  const handleRemoveDimension = (dimension: DatasetColumn) => {
    dispatch(removeColumn({ name: dimension.name }));
  };

  return (
    <Box mt="lg">
      <Text>{t`Dimensions`}</Text>
      <WellBox isHighlighted={isHighlighted} isOver={isOver} ref={setNodeRef}>
        <Stack>
          {dimensions.map(dimension => (
            <WellItem
              key={dimension.id}
              onRemove={() => handleRemoveDimension(dimension)}
            >
              <Ellipsified style={{ flex: 1 }}>
                {dimension.display_name}
              </Ellipsified>
            </WellItem>
          ))}
        </Stack>
      </WellBox>
    </Box>
  );
}

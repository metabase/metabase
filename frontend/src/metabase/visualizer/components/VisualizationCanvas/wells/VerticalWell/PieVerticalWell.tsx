import { useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { type ReactNode, forwardRef } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Stack, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import { useCanHandleActiveItem } from "metabase/visualizer/hooks/use-can-handle-active-item";
import {
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { removeColumn } from "metabase/visualizer/visualizer.slice";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

import { WellItem } from "../WellItem";
import S from "../well.module.css";

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

  const metric = columns.find((col) => col.name === settings["pie.metric"]);

  const canHandleActiveItem = useCanHandleActiveItem({
    active,
    isSuitableColumn: isMetric,
  });

  const handleRemoveMetric = () => {
    if (metric) {
      dispatch(removeColumn({ name: metric.name }));
    }
  };

  return (
    <Box mt="lg">
      <Text>{t`Metric`}</Text>
      <WellBox
        isHighlighted={canHandleActiveItem}
        isOver={isOver}
        ref={setNodeRef}
        data-testid="pie-metric-well"
      >
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

  const canHandleActiveItem = useCanHandleActiveItem({
    active,
    isSuitableColumn: isDimension,
  });

  const dimensions = columns.filter((col) =>
    (settings["pie.dimension"] ?? []).includes(col.name),
  );

  const handleRemoveDimension = (dimension: DatasetColumn) => {
    dispatch(removeColumn({ name: dimension.name }));
  };

  return (
    <Box mt="lg">
      <Text>{t`Dimensions`}</Text>
      <WellBox
        isHighlighted={canHandleActiveItem}
        isOver={isOver}
        ref={setNodeRef}
        data-testid="pie-dimension-well"
      >
        <Stack>
          {dimensions.map((dimension) => (
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

interface WellBoxProps {
  isHighlighted: boolean;
  isOver: boolean;
  children: ReactNode;
}

export const WellBox = forwardRef<HTMLDivElement, WellBoxProps>(
  function WellBox({ children, isHighlighted, isOver, ...props }, ref) {
    return (
      <Box
        {...props}
        className={cx(S.Well, S.defaultBorderRadius, {
          [S.isOver]: isOver,
          [S.isActive]: isHighlighted,
        })}
        mih="120px"
        w="250px"
        ref={ref}
      >
        {children}
      </Box>
    );
  },
);

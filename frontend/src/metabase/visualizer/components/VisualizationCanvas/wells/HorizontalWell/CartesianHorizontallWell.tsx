import { useDraggable, useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Flex, type FlexProps, Text } from "metabase/ui";
import { getDefaultDimensionFilter } from "metabase/visualizations/shared/settings/cartesian-chart";
import { DRAGGABLE_ID, DROPPABLE_ID } from "metabase/visualizer/constants";
import { useCanHandleActiveItem } from "metabase/visualizer/hooks/use-can-handle-active-item";
import {
  getIsMultiseriesCartesianChart,
  getVisualizationType,
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
  getVisualizerRawSettings,
} from "metabase/visualizer/selectors";
import { removeColumn } from "metabase/visualizer/visualizer.slice";
import { isDate, isString } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

import { WellItem } from "../WellItem";
import S from "../well.module.css";

export function CartesianHorizontalWell({ style, ...props }: FlexProps) {
  const display = useSelector(getVisualizationType);
  const rawSettings = useSelector(getVisualizerRawSettings);
  const computedSettings = useSelector(getVisualizerComputedSettings);
  const columns = useSelector(getVisualizerDatasetColumns);
  const isMultiseries = useSelector(getIsMultiseriesCartesianChart);
  const dispatch = useDispatch();

  const { active, setNodeRef, isOver } = useDroppable({
    id: DROPPABLE_ID.X_AXIS_WELL,
  });

  const allDimensions = useMemo(() => {
    const settings = isMultiseries ? rawSettings : computedSettings;
    const dimensionNames = settings["graph.dimensions"] ?? [];
    return dimensionNames
      .map((name) => columns.find((column) => column.name === name))
      .filter(isNotNull);
  }, [columns, computedSettings, rawSettings, isMultiseries]);

  const dimensions = useMemo(() => {
    if (!isMultiseries) {
      return allDimensions;
    }

    const dimensions: DatasetColumn[] = [];
    const timeDimensions = allDimensions.filter(isDate);
    const categoryDimensions = allDimensions.filter(isString);

    // Show only one dimension for multiseries charts,
    // as they have to be added/removed together, not individually
    if (timeDimensions.length > 0) {
      dimensions.push(timeDimensions[0]);
    }
    if (categoryDimensions.length > 0) {
      dimensions.push(...categoryDimensions); //.push(categoryDimensions[0]);
    }

    return dimensions;
  }, [allDimensions, isMultiseries]);

  const isSuitableColumn = useMemo(() => {
    return display ? getDefaultDimensionFilter(display) : () => false;
  }, [display]);

  const canHandleActiveItem = useCanHandleActiveItem({
    active,
    isSuitableColumn,
  });

  const handleRemoveDimension = (dimension: DatasetColumn) => {
    dispatch(removeColumn({ name: dimension.name }));
  };

  return (
    <Flex
      {...props}
      className={cx(S.Well, {
        [S.isOver]: isOver,
        [S.isActive]: canHandleActiveItem,
      })}
      style={{
        ...style,
        height: "100%",
        overflowX: "auto",
        overflowY: "hidden",
      }}
      ref={setNodeRef}
    >
      {dimensions.map((dimension) => (
        <DimensionWellItem
          key={dimension.name}
          dimension={dimension}
          onRemove={() => handleRemoveDimension(dimension)}
        />
      ))}
    </Flex>
  );
}

interface DimensionWellItemProps {
  dimension: DatasetColumn;
  onRemove: () => void;
}

function DimensionWellItem({ dimension, onRemove }: DimensionWellItemProps) {
  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id: `${DROPPABLE_ID.X_AXIS_WELL}:${DRAGGABLE_ID.WELL_ITEM}:${dimension.name}`,
    data: {
      type: DRAGGABLE_ID.WELL_ITEM,
      wellId: DROPPABLE_ID.X_AXIS_WELL,
      column: dimension,
    },
  });

  return (
    <WellItem
      {...attributes}
      {...listeners}
      style={{ visibility: isDragging ? "hidden" : "visible" }}
      onRemove={onRemove}
      ref={setNodeRef}
    >
      <Text truncate>{dimension.display_name}</Text>
    </WellItem>
  );
}

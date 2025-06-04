import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
} from "@dnd-kit/core";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMemo } from "react";

import { Sortable } from "metabase/common/components/Sortable";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex, type FlexProps, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import {
  isArtificialColumn,
  isDraggedColumnItem,
} from "metabase/visualizer/utils";
import {
  removeColumn,
  updateSettings,
} from "metabase/visualizer/visualizer.slice";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";

import { WellItem, type WellItemProps } from "../WellItem";

export function FunnelHorizontalWell({ style, ...props }: FlexProps) {
  const settings = useSelector(getVisualizerComputedSettings);
  const columns = useSelector(getVisualizerDatasetColumns);
  const dispatch = useDispatch();

  const { active, setNodeRef } = useDroppable({
    id: DROPPABLE_ID.X_AXIS_WELL,
  });

  const sensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });

  const dimension = columns.find(
    (column) =>
      column.name === settings["funnel.dimension"] &&
      !isArtificialColumn(column),
  );

  const rows = settings?.["funnel.rows"] ?? [];
  const rowKeys = rows.map((row) => row.key);

  const isHighlighted = useMemo(() => {
    if (!active || !isDraggedColumnItem(active)) {
      return false;
    }
    const { column } = active.data.current;
    return isDimension(column) && !isMetric(column);
  }, [active]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const newIndex = rows.findIndex((row) => row.key === over?.id);
    const oldIndex = rows.findIndex((row) => row.key === active.id);
    const nextRows = arrayMove(rows, oldIndex, newIndex);

    const dimension = settings["funnel.dimension"];
    const orderDimension = settings["funnel.order_dimension"] ?? dimension;

    dispatch(
      updateSettings({
        "funnel.dimension": dimension,
        "funnel.order_dimension": orderDimension,
        "funnel.rows": nextRows,
      }),
    );
  };

  const handleRemove = () => {
    dispatch(removeColumn({ name: settings["funnel.dimension"] }));
  };

  const borderStyle = rows.length > 0 ? "solid" : "dashed";

  return (
    <Flex
      {...props}
      bg={isHighlighted ? "var(--mb-color-brand-light)" : "bg-light"}
      p="sm"
      wrap="nowrap"
      style={{
        ...style,
        height: "100%",
        overflowX: "auto",
        overflowY: "hidden",
        borderRadius: "var(--border-radius-xl)",
        border: `1px ${borderStyle} ${isHighlighted ? "var(--mb-color-brand)" : "var(--border-color)"}`,
        transform: isHighlighted ? "scale(1.025)" : "scale(1)",
        transition:
          "transform 0.2s ease-in-out 0.2s, border-color 0.2s ease-in-out 0.2s, background 0.2s ease-in-out 0.2s",
        outline: isHighlighted ? "1px solid var(--mb-color-brand)" : "none",
      }}
      ref={setNodeRef}
    >
      <DndContext
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        sensors={[sensor]}
        onDragEnd={handleDragEnd}
      >
        {dimension && (
          <FunnelWellItem mr="md" id="dimension" onRemove={handleRemove}>
            <Text truncate>{dimension.display_name}</Text>
          </FunnelWellItem>
        )}
        <SortableContext
          items={rowKeys}
          strategy={horizontalListSortingStrategy}
        >
          <Box
            component="ul"
            display="flex"
            style={{ flexDirection: "row", gap: "1rem" }}
          >
            {rows.map((row) => (
              <FunnelWellItem
                key={row.key}
                component="li"
                id={row.key}
                isDraggable
              >
                <Text truncate>{row.name}</Text>
              </FunnelWellItem>
            ))}
          </Box>
        </SortableContext>
      </DndContext>
    </Flex>
  );
}

interface FunnelWellItemProps extends WellItemProps {
  id: string;
  component?: any;
  isDraggable?: boolean;
}

function FunnelWellItem({
  id,
  isDraggable = false,
  ...props
}: FunnelWellItemProps) {
  const box = (
    <WellItem
      {...props}
      bg={isDraggable ? "var(--mb-color-bg-white)" : "transparent"}
      style={{
        cursor: isDraggable ? "grab" : "default",
      }}
    />
  );

  if (!isDraggable) {
    return box;
  }

  return <Sortable id={id}>{box}</Sortable>;
}

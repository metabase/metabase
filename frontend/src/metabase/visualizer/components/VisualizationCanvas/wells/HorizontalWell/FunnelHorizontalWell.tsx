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
import cx from "classnames";

import { Sortable } from "metabase/common/components/Sortable";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex, type FlexProps, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import { useCanHandleActiveItem } from "metabase/visualizer/hooks/use-can-handle-active-item";
import {
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { isArtificialColumn } from "metabase/visualizer/utils";
import {
  removeColumn,
  updateSettings,
} from "metabase/visualizer/visualizer.slice";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";

import { WellItem, type WellItemProps } from "../WellItem";
import S from "../well.module.css";

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

  const canHandleActiveItem = useCanHandleActiveItem({
    active,
    isSuitableColumn: (column) => isDimension(column) && !isMetric(column),
  });

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

  return (
    <Flex
      {...props}
      className={cx(S.Well, {
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
      bg={isDraggable ? "background-primary" : "transparent"}
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

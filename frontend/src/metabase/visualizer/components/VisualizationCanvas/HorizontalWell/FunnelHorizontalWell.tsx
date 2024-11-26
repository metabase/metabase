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

import { Sortable } from "metabase/core/components/Sortable";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex, type FlexProps, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import { getVisualizerComputedSettings } from "metabase/visualizer/selectors";
import {
  removeColumn,
  updateSettings,
} from "metabase/visualizer/visualizer.slice";

import { WellItem, type WellItemProps } from "../WellItem";

export function FunnelHorizontalWell({ style, ...props }: FlexProps) {
  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const { active, setNodeRef, isOver } = useDroppable({
    id: DROPPABLE_ID.X_AXIS_WELL,
  });

  const sensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });

  const rows = settings?.["funnel.rows"] ?? [];
  const rowKeys = rows.map(row => row.key);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const newIndex = rows.findIndex(row => row.key === over?.id);
    const oldIndex = rows.findIndex(row => row.key === active.id);
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
    dispatch(
      removeColumn({
        name: settings["funnel.dimension"],
        wellId: DROPPABLE_ID.X_AXIS_WELL,
      }),
    );
  };

  const borderStyle = rows.length > 0 ? "solid" : "dashed";

  return (
    <Flex
      {...props}
      bg={active ? "var(--mb-color-brand-light)" : "bg-light"}
      p="sm"
      wrap="nowrap"
      style={{
        ...style,
        overflowX: "auto",
        overflowY: "hidden",
        borderRadius: "var(--border-radius-xl)",
        border: `1px ${borderStyle} ${active ? "var(--mb-color-brand)" : "var(--border-color)"}`,
        transform: active ? "scale(1.025)" : "scale(1)",
        transition:
          "transform 0.2s ease-in-out 0.2s, border-color 0.2s ease-in-out 0.2s, background 0.2s ease-in-out 0.2s",
        outline: isOver ? "1px solid var(--mb-color-brand)" : "none",
      }}
      maw="80%"
      ref={setNodeRef}
    >
      <DndContext
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        sensors={[sensor]}
        onDragEnd={handleDragEnd}
      >
        {settings["funnel.dimension"] && (
          <FunnelWellItem mr="md" id="dimension" onRemove={handleRemove}>
            <Text truncate>{settings["funnel.dimension"]}</Text>
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
            {rows.map(row => (
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
        border: `1px solid hsla(204,66,8,51%)`,
      }}
    />
  );

  if (!isDraggable) {
    return box;
  }

  return <Sortable id={id}>{box}</Sortable>;
}

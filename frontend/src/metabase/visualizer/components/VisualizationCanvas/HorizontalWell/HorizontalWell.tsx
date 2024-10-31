import { DndContext, type DragEndEvent, useDroppable } from "@dnd-kit/core";
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
import { Box, type BoxProps, Flex, type FlexProps, Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { DROPPABLE_ID } from "metabase/visualizer/dnd/constants";
import type {
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

interface HorizontalWellProps extends FlexProps {
  display: VisualizationDisplay;
  settings: ComputedVisualizationSettings;
  onChangeSettings: (settings: VisualizationSettings) => void;
}

export function HorizontalWell({
  display,
  settings,
  style,
  onChangeSettings,
  ...props
}: HorizontalWellProps) {
  const { active, setNodeRef, isOver } = useDroppable({
    id: DROPPABLE_ID.X_AXIS_WELL,
  });

  if (display !== "funnel") {
    return null;
  }

  const rows = settings?.["funnel.rows"] ?? [];
  const rowKeys = rows.map(row => row.key);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const newIndex = rows.findIndex(row => row.key === over?.id);
    const oldIndex = rows.findIndex(row => row.key === active.id);
    const nextRows = arrayMove(rows, oldIndex, newIndex);

    const dimension = settings["funnel.dimension"];
    const orderDimension = settings["funnel.order_dimension"] ?? dimension;

    onChangeSettings({
      "funnel.dimension": dimension,
      "funnel.order_dimension": orderDimension,
      "funnel.rows": nextRows,
    });
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
        onDragEnd={handleDragEnd}
      >
        <WellItem mr="md" id="dimension">
          <Text color="text-white" truncate>
            {settings["funnel.dimension"]}
          </Text>
        </WellItem>
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
              <WellItem key={row.key} component="li" id={row.key} isDraggable>
                <Text truncate>{row.name}</Text>
              </WellItem>
            ))}
          </Box>
        </SortableContext>
      </DndContext>
    </Flex>
  );
}

interface WellItemProps extends BoxProps {
  id: string;
  component?: any;
  isDraggable?: boolean;
}

function WellItem({ id, isDraggable = false, ...props }: WellItemProps) {
  const box = (
    <Box
      {...props}
      bg={isDraggable ? "var(--mb-color-bg-white)" : "transparent"}
      px="sm"
      style={{
        borderRadius: "var(--border-radius-xl)",
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

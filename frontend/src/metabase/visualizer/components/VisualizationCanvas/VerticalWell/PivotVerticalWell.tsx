import { type Active, useDraggable, useDroppable } from "@dnd-kit/core";
import { type ReactNode, forwardRef, useMemo } from "react";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { type BoxProps, Flex, Stack, Text } from "metabase/ui";
import { DRAGGABLE_ID, DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getVisualizerComputedSettings,
  getVisualizerRawSeries,
} from "metabase/visualizer/selectors";
import { isDraggedColumnItem } from "metabase/visualizer/utils";
import { removeColumn } from "metabase/visualizer/visualizer.slice";
import type { DatasetColumn, RawSeries } from "metabase-types/api";

import { WellItem } from "../WellItem";

export function PivotVerticalWell() {
  const settings = useSelector(getVisualizerComputedSettings);
  const series = useSelector(getVisualizerRawSeries);
  const dispatch = useDispatch();

  const droppableColumnsWell = useDroppable({
    id: DROPPABLE_ID.PIVOT_COLUMNS_WELL,
  });
  const droppableValuesWell = useDroppable({
    id: DROPPABLE_ID.PIVOT_VALUES_WELL,
  });
  const droppableRowsWell = useDroppable({ id: DROPPABLE_ID.PIVOT_ROWS_WELL });

  const { cols, rows, values } = useMemo(() => {
    const { columns, rows, values } =
      settings["pivot_table.column_split"] ?? {};
    return {
      cols: findPivotColumns(series, columns),
      rows: findPivotColumns(series, rows),
      values: findPivotColumns(series, values),
    };
  }, [series, settings]);

  const handleRemoveColumn = (column: DatasetColumn, wellId: string) => {
    dispatch(removeColumn({ name: column.name, wellId }));
  };

  if (!series[0]?.data) {
    return null;
  }

  return (
    <Stack mr="lg">
      <WellBox
        isHighlighted={isWellBoxHighlighted(droppableRowsWell)}
        ref={droppableRowsWell.setNodeRef}
      >
        <Text>Rows</Text>
        {rows.map(rowCol => (
          <DraggableWellItem
            key={rowCol.name}
            column={rowCol}
            wellId={DROPPABLE_ID.PIVOT_ROWS_WELL}
            onRemove={() =>
              handleRemoveColumn(rowCol, DROPPABLE_ID.PIVOT_ROWS_WELL)
            }
          >
            <Text truncate>{rowCol.display_name}</Text>
          </DraggableWellItem>
        ))}
      </WellBox>
      <WellBox
        isHighlighted={isWellBoxHighlighted(droppableColumnsWell)}
        ref={droppableColumnsWell.setNodeRef}
      >
        <Text>Columns</Text>
        {cols.map(col => (
          <DraggableWellItem
            key={col.name}
            column={col}
            wellId={DROPPABLE_ID.PIVOT_COLUMNS_WELL}
            onRemove={() =>
              handleRemoveColumn(col, DROPPABLE_ID.PIVOT_COLUMNS_WELL)
            }
          >
            <Text key={col.name} truncate>
              {col.display_name}
            </Text>
          </DraggableWellItem>
        ))}
      </WellBox>
      <WellBox
        isHighlighted={isWellBoxHighlighted(droppableValuesWell)}
        ref={droppableValuesWell.setNodeRef}
      >
        <Text>Measures</Text>
        {values.map(valueCol => (
          <DraggableWellItem
            key={valueCol.name}
            column={valueCol}
            wellId={DROPPABLE_ID.PIVOT_VALUES_WELL}
            onRemove={() =>
              handleRemoveColumn(valueCol, DROPPABLE_ID.PIVOT_VALUES_WELL)
            }
          >
            <Text truncate>{valueCol.display_name}</Text>
          </DraggableWellItem>
        ))}
      </WellBox>
    </Stack>
  );
}

interface WellBoxProps {
  isHighlighted?: boolean;
  children: ReactNode;
}

const WellBox = forwardRef<HTMLDivElement, WellBoxProps>(function WellBox(
  { isHighlighted, children },
  ref,
) {
  const borderColor = isHighlighted
    ? "var(--mb-color-brand)"
    : "var(--mb-color-border)";
  return (
    <Flex
      direction="column"
      bg={
        isHighlighted
          ? "var(--mb-color-brand-light)"
          : "var(--mb-color-bg-light)"
      }
      p="md"
      gap="sm"
      wrap="nowrap"
      w="190px"
      mih="90px"
      style={{
        borderRadius: "var(--default-border-radius)",
        border: `1px solid ${borderColor}`,
        transform: isHighlighted ? "scale(1.025)" : "scale(1)",
        transition:
          "transform 0.2s ease-in-out 0.2s, border-color 0.2s ease-in-out 0.2s, background 0.2s ease-in-out 0.2s",
      }}
      ref={ref}
    >
      {children}
    </Flex>
  );
});

interface DraggableWellItemProps extends BoxProps {
  column: DatasetColumn;
  wellId: string;
  onRemove: () => void;
}

function DraggableWellItem({
  column,
  wellId,
  ...props
}: DraggableWellItemProps) {
  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id: `${wellId}:${DRAGGABLE_ID.WELL_ITEM}:${column.name}`,
    data: {
      type: DRAGGABLE_ID.WELL_ITEM,
      wellId,
      column,
    },
  });

  return (
    <WellItem
      {...props}
      {...attributes}
      {...listeners}
      style={{
        cursor: "grab",
        visibility: isDragging ? "hidden" : "visible",
      }}
      ref={setNodeRef}
    />
  );
}

function findPivotColumns(series: RawSeries, columnNames: string[] = []) {
  const [{ data }] = series ?? [];
  if (!data) {
    return [];
  }
  return columnNames
    .map(name => data.cols.find(col => col.name === name))
    .filter(isNotNull);
}

function isWellBoxHighlighted({
  active,
  isOver,
}: {
  isOver: boolean;
  active?: Active | null;
}) {
  return Boolean(isOver && active && isDraggedColumnItem(active));
}

import {
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  type SensorDescriptor,
  type SensorOptions,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Table as ReactTable } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import { ROW_ID_COLUMN_ID } from "../constants";

export type ColumnsReordering = {
  sensors: SensorDescriptor<SensorOptions>[];
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (_event: DragEndEvent) => void;
};

export const useColumnsReordering = <TData,>(
  table: ReactTable<TData>,
  onColumnReorder?: (columnNames: string[]) => void,
): ColumnsReordering => {
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor),
  );

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (active && over && active.id !== over.id && !over.disabled) {
        table.setColumnOrder(columnOrder => {
          const oldIndex = columnOrder.indexOf(active.id as string);
          const newIndex = columnOrder.indexOf(over.id as string);
          return arrayMove(columnOrder, oldIndex, newIndex);
        });
      }
    },
    [table],
  );

  const onDragEnd = useCallback(
    (_event: DragEndEvent) => {
      const columns = table
        .getState()
        .columnOrder.filter(columnName => columnName !== ROW_ID_COLUMN_ID);

      onColumnReorder?.(columns);
    },
    [onColumnReorder, table],
  );

  const columnsReordering = useMemo(
    () => ({
      onDragOver,
      onDragEnd,
      sensors,
    }),
    [onDragEnd, onDragOver, sensors],
  );

  return columnsReordering;
};

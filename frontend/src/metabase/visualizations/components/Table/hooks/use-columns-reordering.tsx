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
import { type RefObject, useCallback, useMemo } from "react";

import { ROW_ID_COLUMN_ID } from "../constants";

export type ColumnsReordering = {
  sensors: SensorDescriptor<SensorOptions>[];
  onDragStart: (_event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (_event: DragEndEvent) => void;
};

export const useColumnsReordering = <TData,>(
  gridRef: RefObject<HTMLDivElement>,
  table: ReactTable<TData>,
  onColumnReorder?: (columnNames: string[]) => void,
): ColumnsReordering => {
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor),
  );

  const onDragStart = useCallback(
    (_event: DragStartEvent) => {
      if (gridRef.current) {
        gridRef.current.style.overflow = "hidden";
      }
    },
    [gridRef],
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
      if (gridRef.current) {
        gridRef.current.style.overflow = "auto";
      }

      const columns = table
        .getState()
        .columnOrder.filter(columnName => columnName !== ROW_ID_COLUMN_ID);

      onColumnReorder?.(columns);
    },
    [gridRef, onColumnReorder, table],
  );

  const columnsReordering = useMemo(
    () => ({
      onDragStart,
      onDragOver,
      onDragEnd,
      sensors,
    }),
    [onDragEnd, onDragOver, onDragStart, sensors],
  );

  return columnsReordering;
};

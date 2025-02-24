import {
  type DragEndEvent,
  type DragOverEvent,
  KeyboardSensor,
  MouseSensor,
  type SensorDescriptor,
  type SensorOptions,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Table as ReactTable } from "@tanstack/react-table";
import { useCallback, useMemo, useRef } from "react";

import { ROW_ID_COLUMN_ID } from "../constants";
import _ from "underscore";

export type ColumnsReordering = {
  sensors: SensorDescriptor<SensorOptions>[];
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragStart: (event: DragStartEvent) => void;
};

export const useColumnsReordering = <TData,>(
  table: ReactTable<TData>,
  onColumnReorder?: (columnNames: string[]) => void,
): ColumnsReordering => {
  const prevOrder = useRef<string[] | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor),
  );

  const onDragStart = useCallback(() => {
    prevOrder.current = table.getState().columnOrder;
  }, []);

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
      const newColumnOrder = table.getState().columnOrder;
      if (!_.isEqual(newColumnOrder, prevOrder.current)) {
        const dataColumns = newColumnOrder.filter(
          columnName => columnName !== ROW_ID_COLUMN_ID,
        );
        onColumnReorder?.(dataColumns);
      }

      prevOrder.current = null;
    },
    [onColumnReorder, table],
  );

  const columnsReordering = useMemo(
    () => ({
      onDragStart,
      onDragOver,
      onDragEnd,
      sensors,
    }),
    [onDragEnd, onDragOver, sensors],
  );

  return columnsReordering;
};

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

export type ColumnsReordering = {
  sensors: SensorDescriptor<SensorOptions>[];
  onDragStart: (_event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (_event: DragEndEvent) => void;
};

export const useColumnsReordering = <TData,>(
  bodyRef: RefObject<HTMLDivElement>,
  table: ReactTable<TData>,
): ColumnsReordering => {
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  );

  const onDragStart = useCallback(
    (_event: DragStartEvent) => {
      if (bodyRef.current) {
        bodyRef.current.style.overflow = "hidden";
      }
    },
    [bodyRef],
  );

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (active && over && active.id !== over.id) {
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
      if (bodyRef.current) {
        bodyRef.current.style.overflow = "auto";
      }

      console.log(">>>column order", table.getState().columnOrder);
    },
    [bodyRef, table],
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

import {
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  type SensorDescriptor,
  type SensorOptions,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Table as ReactTable } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import _ from "underscore";

import { ROW_ID_COLUMN_ID } from "../constants";

export type ColumnsReordering = {
  sensors: SensorDescriptor<SensorOptions>[];
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragStart: (event: DragStartEvent) => void;
  isDragging: boolean;
};

export const useColumnsReordering = <TData,>(
  table: ReactTable<TData>,
  gridRef: React.RefObject<HTMLDivElement>,
  onColumnReorder?: (columnNames: string[]) => void,
): ColumnsReordering => {
  const prevOrder = useRef<string[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const previousScrollTop = useRef<number>(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(KeyboardSensor),
  );

  useEffect(
    function preserveScrollWhenDragging() {
      if (!isDragging || !gridRef.current) {
        return;
      }

      const gridElement = gridRef.current;
      previousScrollTop.current = gridElement.scrollTop;

      const handleScroll = () => {
        if (gridElement.scrollTop !== previousScrollTop.current) {
          gridElement.scrollTop = previousScrollTop.current;
        }
      };

      gridElement.addEventListener("scroll", handleScroll, { passive: false });

      return () => {
        gridElement.removeEventListener("scroll", handleScroll);
        gridElement.style.overflowY = "";
      };
    },
    [isDragging, gridRef],
  );

  const onDragStart = useCallback(() => {
    prevOrder.current = table.getState().columnOrder;
    setIsDragging(true);

    if (gridRef.current) {
      previousScrollTop.current = gridRef.current.scrollTop;
      gridRef.current.style.overflowY = "hidden";
    }
  }, [table, gridRef]);

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (active && over && active.id !== over.id && !over.disabled) {
        table.setColumnOrder((columnOrder) => {
          const oldIndex = columnOrder.indexOf(active.id as string);
          const newIndex = columnOrder.indexOf(over.id as string);
          return arrayMove(columnOrder, oldIndex, newIndex);
        });
      }
    },
    [table],
  );

  const onDragEnd = useCallback(() => {
    setIsDragging(false);

    // Restore scrolling
    if (gridRef.current) {
      gridRef.current.style.overflowY = "";
    }

    const newColumnOrder = table.getState().columnOrder;
    if (!_.isEqual(newColumnOrder, prevOrder.current)) {
      const dataColumns = newColumnOrder.filter(
        (columnName) => columnName !== ROW_ID_COLUMN_ID,
      );
      onColumnReorder?.(dataColumns);
    }

    prevOrder.current = null;
  }, [onColumnReorder, table, gridRef]);

  return useMemo(
    () => ({
      onDragStart,
      onDragOver,
      onDragEnd,
      sensors,
      isDragging,
    }),
    [onDragEnd, onDragOver, onDragStart, sensors, isDragging],
  );
};

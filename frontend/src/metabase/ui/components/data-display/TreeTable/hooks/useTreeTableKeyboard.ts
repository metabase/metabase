import type { Row, Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { type KeyboardEvent, useCallback, useMemo, useState } from "react";

import type { TreeNodeData } from "../types";

interface UseTreeTableKeyboardOptions<TData extends TreeNodeData> {
  table: Table<TData>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  topPinnedRows: Row<TData>[];
  centerRows: Row<TData>[];
  bottomPinnedRows: Row<TData>[];
  enableRowSelection?: boolean;
  onRowActivate?: (row: Row<TData>) => void;
}

interface UseTreeTableKeyboardResult {
  activeRowId: string | null;
  setActiveRowId: (id: string | null) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export function useTreeTableKeyboard<TData extends TreeNodeData>({
  table,
  virtualizer,
  topPinnedRows,
  centerRows,
  bottomPinnedRows,
  enableRowSelection,
  onRowActivate,
}: UseTreeTableKeyboardOptions<TData>): UseTreeTableKeyboardResult {
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  /**
   * we can't use table.getRowModel().rows because it respects the original
   * data order, not the visual order when rows are pinned
   */
  const allRows = useMemo(
    () => [...topPinnedRows, ...centerRows, ...bottomPinnedRows],
    [topPinnedRows, centerRows, bottomPinnedRows],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const currentIndex = allRows.findIndex((r) => r.id === activeRowId);
      const currentRow: Row<TData> | undefined = allRows[currentIndex];

      const scrollToRowIfNeeded = (rowId: string) => {
        const centerIndex = centerRows.findIndex((r) => r.id === rowId);
        if (centerIndex >= 0) {
          virtualizer.scrollToIndex(centerIndex);
        }
      };

      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          const nextIndex = Math.min(currentIndex + 1, allRows.length - 1);
          const nextRow = allRows[nextIndex];
          if (nextRow) {
            setActiveRowId(nextRow.id);
            scrollToRowIfNeeded(nextRow.id);
          }
          break;
        }

        case "ArrowUp": {
          event.preventDefault();
          const prevIndex = Math.max(currentIndex - 1, 0);
          const prevRow = allRows[prevIndex];
          if (prevRow) {
            setActiveRowId(prevRow.id);
            scrollToRowIfNeeded(prevRow.id);
          }
          break;
        }

        case "ArrowRight": {
          event.preventDefault();
          if (currentRow?.getCanExpand() && !currentRow.getIsExpanded()) {
            currentRow.toggleExpanded(true);
          }
          break;
        }

        case "ArrowLeft": {
          event.preventDefault();
          if (currentRow?.getIsExpanded()) {
            currentRow.toggleExpanded(false);
          } else if (currentRow?.parentId) {
            const parentRow = allRows.find((r) => r.id === currentRow.parentId);
            if (parentRow) {
              setActiveRowId(parentRow.id);
              scrollToRowIfNeeded(parentRow.id);
            }
          }
          break;
        }

        case "Enter": {
          event.preventDefault();
          if (currentRow) {
            onRowActivate?.(currentRow);
          }
          break;
        }

        case " ": {
          event.preventDefault();
          if (currentRow?.getCanExpand()) {
            currentRow.toggleExpanded();
          } else if (enableRowSelection && currentRow?.getCanSelect()) {
            currentRow.toggleSelected();
          }
          break;
        }

        case "Home": {
          event.preventDefault();
          const firstRow = allRows[0];
          if (firstRow) {
            setActiveRowId(firstRow.id);
            scrollToRowIfNeeded(firstRow.id);
          }
          break;
        }

        case "End": {
          event.preventDefault();
          const lastRow = allRows[allRows.length - 1];
          if (lastRow) {
            setActiveRowId(lastRow.id);
            scrollToRowIfNeeded(lastRow.id);
          }
          break;
        }

        case "Escape": {
          event.preventDefault();
          if (enableRowSelection) {
            table.resetRowSelection();
          }
          break;
        }
      }
    },
    [
      table,
      virtualizer,
      centerRows,
      activeRowId,
      enableRowSelection,
      onRowActivate,
      allRows,
    ],
  );

  return { activeRowId, setActiveRowId, handleKeyDown };
}

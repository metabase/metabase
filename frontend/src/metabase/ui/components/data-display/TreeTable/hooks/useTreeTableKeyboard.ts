import type { Row, Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { KeyboardEvent } from "react";
import { useCallback, useState } from "react";

import type { TreeNodeData } from "../types";

interface UseTreeTableKeyboardOptions<TData extends TreeNodeData> {
  table: Table<TData>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
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
  enableRowSelection,
  onRowActivate,
}: UseTreeTableKeyboardOptions<TData>): UseTreeTableKeyboardResult {
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const rows = table.getRowModel().rows;
      const currentIndex = rows.findIndex((r) => r.id === activeRowId);
      const currentRow: Row<TData> | undefined = rows[currentIndex];

      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          const nextIndex = Math.min(currentIndex + 1, rows.length - 1);
          const nextRow = rows[nextIndex];
          if (nextRow) {
            setActiveRowId(nextRow.id);
            virtualizer.scrollToIndex(nextIndex);
          }
          break;
        }

        case "ArrowUp": {
          event.preventDefault();
          const prevIndex = Math.max(currentIndex - 1, 0);
          const prevRow = rows[prevIndex];
          if (prevRow) {
            setActiveRowId(prevRow.id);
            virtualizer.scrollToIndex(prevIndex);
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
            const parentRow = rows.find((r) => r.id === currentRow.parentId);
            if (parentRow) {
              setActiveRowId(parentRow.id);
              const parentIndex = rows.indexOf(parentRow);
              if (parentIndex >= 0) {
                virtualizer.scrollToIndex(parentIndex);
              }
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
          const firstRow = rows[0];
          if (firstRow) {
            setActiveRowId(firstRow.id);
            virtualizer.scrollToIndex(0);
          }
          break;
        }

        case "End": {
          event.preventDefault();
          const lastRow = rows[rows.length - 1];
          if (lastRow) {
            setActiveRowId(lastRow.id);
            virtualizer.scrollToIndex(rows.length - 1);
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
    [table, virtualizer, activeRowId, enableRowSelection, onRowActivate],
  );

  return { activeRowId, setActiveRowId, handleKeyDown };
}

import { useCallback, useState } from "react";

import type {
  SortDirection,
  SortingFn,
  SortingState,
  TreeColumnDef,
  TreeNodeData,
  TreeSorting,
} from "../types";

/** Options for tree sorting behavior */
export interface UseTreeSortingOptions<TData extends TreeNodeData> {
  /** Column definitions (for sortingFn lookup) */
  columns: TreeColumnDef<TData>[];
  /** Function to get children (for recursive sorting) */
  getChildren: (node: TData) => TData[] | undefined | null;
  /** Controlled sorting state */
  sorting?: SortingState | null;
  /** Callback when sorting changes */
  onSortingChange?: (sorting: SortingState | null) => void;
  /** Skip client-side sorting (for server-side sorting) */
  manualSorting?: boolean;
}

type BuiltInSortingFn = "alphanumeric" | "datetime" | "numeric";

function compareValues<TData>(
  a: unknown,
  b: unknown,
  direction: SortDirection,
  sortingFn: SortingFn<TData>,
  nodeA: TData,
  nodeB: TData,
): number {
  const multiplier = direction === "asc" ? 1 : -1;

  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return 1;
  }
  if (b == null) {
    return -1;
  }

  if (typeof sortingFn === "function") {
    return sortingFn(nodeA, nodeB, direction);
  }

  const builtInFn: BuiltInSortingFn = sortingFn;

  switch (builtInFn) {
    case "numeric": {
      const numA = typeof a === "number" ? a : parseFloat(String(a));
      const numB = typeof b === "number" ? b : parseFloat(String(b));
      if (isNaN(numA) && isNaN(numB)) {
        return 0;
      }
      if (isNaN(numA)) {
        return 1;
      }
      if (isNaN(numB)) {
        return -1;
      }
      return (numA - numB) * multiplier;
    }

    case "datetime": {
      const dateA = a instanceof Date ? a : new Date(String(a));
      const dateB = b instanceof Date ? b : new Date(String(b));
      const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
      const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
      return (timeA - timeB) * multiplier;
    }

    case "alphanumeric":
    default: {
      const strA = String(a).toLowerCase();
      const strB = String(b).toLowerCase();
      return strA.localeCompare(strB) * multiplier;
    }
  }
}

/**
 * Manages column sorting state and provides client-side sorting.
 *
 * Features:
 * - Toggle sort cycles through: asc → desc → none
 * - Recursively sorts children within each parent
 * - Built-in sort functions: alphanumeric, numeric, datetime
 * - Custom sort function support via column.sortingFn
 */
export function useTreeSorting<TData extends TreeNodeData>({
  columns,
  getChildren,
  sorting: controlledSorting,
  onSortingChange,
  manualSorting = false,
}: UseTreeSortingOptions<TData>): TreeSorting<TData> {
  const [internalSorting, setInternalSorting] = useState<SortingState | null>(
    null,
  );

  const isControlled = controlledSorting !== undefined;
  const sorting = isControlled ? controlledSorting : internalSorting;

  const setSorting = useCallback(
    (newSorting: SortingState | null) => {
      if (!isControlled) {
        setInternalSorting(newSorting);
      }
      onSortingChange?.(newSorting);
    },
    [isControlled, onSortingChange],
  );

  const isSorted = useCallback(
    (columnId: string) => sorting?.columnId === columnId,
    [sorting],
  );

  const getSortDirection = useCallback(
    (columnId: string): SortDirection | null => {
      if (sorting && sorting.columnId === columnId) {
        return sorting.direction;
      }
      return null;
    },
    [sorting],
  );

  const toggleSort = useCallback(
    (columnId: string) => {
      const column = columns.find((c) => c.id === columnId);
      if (!column?.enableSorting) {
        return;
      }

      if (sorting?.columnId !== columnId) {
        setSorting({ columnId, direction: "asc" });
      } else if (sorting.direction === "asc") {
        setSorting({ columnId, direction: "desc" });
      } else {
        setSorting(null);
      }
    },
    [columns, sorting, setSorting],
  );

  const setSort = useCallback(
    (columnId: string, direction: SortDirection) => {
      const column = columns.find((c) => c.id === columnId);
      if (!column?.enableSorting) {
        return;
      }
      setSorting({ columnId, direction });
    },
    [columns, setSorting],
  );

  const clearSort = useCallback(() => {
    setSorting(null);
  }, [setSorting]);

  const sortData = useCallback(
    (data: TData[]): TData[] => {
      if (manualSorting || !sorting) {
        return data;
      }

      const column = columns.find((c) => c.id === sorting.columnId);
      if (!column) {
        return data;
      }

      const getValue = (node: TData): unknown => {
        if (column.accessorFn) {
          return column.accessorFn(node);
        }
        if (column.accessorKey) {
          return node[column.accessorKey];
        }
        return undefined;
      };

      const sortingFn: SortingFn<TData> = column.sortingFn ?? "alphanumeric";

      function sortNodes(nodes: TData[]): TData[] {
        const sorted = [...nodes].sort((a, b) => {
          const valueA = getValue(a);
          const valueB = getValue(b);
          return compareValues(
            valueA,
            valueB,
            sorting.direction,
            sortingFn,
            a,
            b,
          );
        });

        return sorted.map((node) => {
          const children = getChildren(node);
          if (children && children.length > 0) {
            const sortedChildren = sortNodes(children);
            return { ...node, children: sortedChildren };
          }
          return node;
        });
      }

      return sortNodes(data);
    },
    [manualSorting, sorting, columns, getChildren],
  );

  return {
    sorting,
    isSorted,
    getSortDirection,
    toggleSort,
    setSort,
    clearSort,
    sortData,
  };
}

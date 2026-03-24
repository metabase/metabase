import { pointerWithin } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { useCallback, useMemo } from "react";

import type { DataGridColumnType } from "../types";

import type { ColumnsReordering } from "./use-columns-reordering";

export const useDataGridColumnsReordering = <TData,>(
  columnsReordering: ColumnsReordering,
  pinnedColumns: DataGridColumnType<TData>[],
) => {
  const pinnedColumnIdSet = useMemo(
    () => new Set(pinnedColumns.map((c) => c.origin.id)),
    [pinnedColumns],
  );

  const collisionDetection = useCallback(
    (args: Parameters<typeof pointerWithin>[0]) => {
      const collisions = pointerWithin(args);
      if (collisions.length <= 1) {
        return collisions;
      }

      const pinnedCollisions = collisions.filter((c) =>
        pinnedColumnIdSet.has(String(c.id)),
      );

      return pinnedCollisions.length > 0 ? pinnedCollisions : collisions;
    },
    [pinnedColumnIdSet],
  );

  return useMemo(
    () => ({
      collisionDetection,
      modifiers: [restrictToHorizontalAxis],
      ...columnsReordering,
    }),
    [collisionDetection, columnsReordering],
  );
};

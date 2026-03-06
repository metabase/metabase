import type { ColumnPinningState } from "@tanstack/react-table";
import { useMemo } from "react";

type UseColumnPinningByCountProps = {
  pinnedLeftColumnsCount: number;
  columnOrder: string[];
  hasRowIdColumn: boolean;
  hasColumnRowSelectColumn: boolean;
};

export const useColumnPinningByCount = ({
  pinnedLeftColumnsCount,
  columnOrder,
  hasRowIdColumn,
  hasColumnRowSelectColumn,
}: UseColumnPinningByCountProps): ColumnPinningState =>
  useMemo(
    () => ({
      left: columnOrder.slice(
        0,
        pinnedLeftColumnsCount +
          (hasRowIdColumn ? 1 : 0) +
          (hasColumnRowSelectColumn ? 1 : 0),
      ),
    }),
    [
      columnOrder,
      pinnedLeftColumnsCount,
      hasRowIdColumn,
      hasColumnRowSelectColumn,
    ],
  );

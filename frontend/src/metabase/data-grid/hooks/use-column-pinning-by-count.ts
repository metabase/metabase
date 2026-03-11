import type { ColumnPinningState } from "@tanstack/react-table";
import { useMemo } from "react";

type UseColumnPinningByCountProps = {
  pinnedLeftColumnsCount: number;
  columnOrder: string[];
  utilityColumnsCount: number;
};

export const useColumnPinningByCount = ({
  pinnedLeftColumnsCount,
  columnOrder,
  utilityColumnsCount,
}: UseColumnPinningByCountProps): ColumnPinningState =>
  useMemo(
    () => ({
      left: columnOrder.slice(0, pinnedLeftColumnsCount + utilityColumnsCount),
    }),
    [columnOrder, pinnedLeftColumnsCount, utilityColumnsCount],
  );

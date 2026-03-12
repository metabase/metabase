import type { Row, RowPinningState } from "@tanstack/react-table";
import type { RefObject } from "react";
import { useMemo } from "react";

import { useItemsLimiter } from "./use-items-limiter";

type UseRowPinningByCountProps<TData> = {
  top?: number;
  data: TData[];
  getRowId: (originalRow: TData, index: number, parent?: Row<TData>) => string;
  gridRef: RefObject<HTMLDivElement | null>;
  pinnedRowHeights: number[];
};

export const useRowPinningByCount = <TData>({
  top = 0,
  data,
  getRowId,
  gridRef,
  pinnedRowHeights,
}: UseRowPinningByCountProps<TData>): RowPinningState => {
  const effectivePinnedRowsCount = useItemsLimiter({
    containerRef: gridRef,
    dimension: "height",
    sizes: pinnedRowHeights,
    maxRatio: 0.9,
  });

  const pinnedCount =
    pinnedRowHeights.length > 0 ? effectivePinnedRowsCount : top;

  return useMemo(() => {
    const topIds = data
      .slice(0, pinnedCount)
      .map((row, index) => getRowId(row, index));
    return { top: topIds };
  }, [pinnedCount, data, getRowId]);
};

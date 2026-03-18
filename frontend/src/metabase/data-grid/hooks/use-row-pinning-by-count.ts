import type { Row, RowPinningState } from "@tanstack/react-table";
import type { RefObject } from "react";
import { useMemo } from "react";

import { HEADER_HEIGHT } from "../constants";

import { useItemsLimiter } from "./use-items-limiter";
import type { RowSizingState } from "./use-row-heights/types";

type UseRowPinningByCountProps<TData> = {
  top?: number;
  data: TData[];
  getRowId: (originalRow: TData, index: number, parent?: Row<TData>) => string;
  gridRef: RefObject<HTMLDivElement | null>;
  rowSizingMap: RowSizingState;
};

export const useRowPinningByCount = <TData>({
  top = 0,
  data,
  getRowId,
  gridRef,
  rowSizingMap,
}: UseRowPinningByCountProps<TData>): RowPinningState => {
  const candidateHeights = useMemo(() => {
    const topRowHeights = rowSizingMap
      .entries()
      .toArray()
      .sort((a, b) => a[0] - b[0])
      .slice(0, top)
      .map(([, value]) => value);
    return [HEADER_HEIGHT, ...topRowHeights];
  }, [rowSizingMap, top]);

  const effectivePinnedRowsCount = useItemsLimiter({
    containerRef: gridRef,
    dimension: "height",
    sizes: candidateHeights,
    maxRatio: 0.8,
  });

  return useMemo(() => {
    const actualPinnedCount = Math.max(0, effectivePinnedRowsCount - 1);
    const topIds = data
      .slice(0, actualPinnedCount)
      .map((row, index) => getRowId(row, index));
    return { top: topIds };
  }, [effectivePinnedRowsCount, data, getRowId]);
};

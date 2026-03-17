import type { Row, RowPinningState } from "@tanstack/react-table";
import type { RefObject } from "react";
import { useMemo } from "react";

// import { HEADER_HEIGHT } from "../constants";

// import { useItemsLimiter } from "./use-items-limiter";

type UseRowPinningByCountProps<TData> = {
  top?: number;
  data: TData[];
  getRowId: (originalRow: TData, index: number, parent?: Row<TData>) => string;
  gridRef: RefObject<HTMLDivElement | null>;
  topRowHeights: number[];
};

export const useRowPinningByCount = <TData>({
  top = 0,
  data,
  getRowId,
  // gridRef,
  // topRowHeights,
}: UseRowPinningByCountProps<TData>): RowPinningState => {
  // const pinnedRowSizes = useMemo(
  //   () => [HEADER_HEIGHT, ...topRowHeights.slice(0, top)],
  //   [topRowHeights, top],
  // );

  // let effectivePinnedRowsCount = useItemsLimiter({
  //   containerRef: gridRef,
  //   dimension: "height",
  //   sizes: pinnedRowSizes,
  //   maxRatio: 0.9,
  // });

  const effectivePinnedRowsCount = top;

  return useMemo(() => {
    const actualPinnedCount = Math.max(0, effectivePinnedRowsCount - 1);
    const topIds = data
      .slice(0, actualPinnedCount)
      .map((row, index) => getRowId(row, index));
    return { top: topIds };
  }, [effectivePinnedRowsCount, data, getRowId]);
};

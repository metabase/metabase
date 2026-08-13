import type { Row, RowPinningState } from "@tanstack/react-table";
import type { RefObject } from "react";
import { useMemo } from "react";

import { HEADER_HEIGHT } from "../constants";
import { countWithinLimit } from "../utils/count-within-limit";

type UseRowPinningByCountProps<TData> = {
  top?: number;
  sortedRows: Row<TData>[];
  gridRef: RefObject<HTMLDivElement | null>;
  getRowHeight: (index: number) => number;
};

export const useRowPinningByCount = <TData>({
  top = 0,
  sortedRows,
  gridRef,
  getRowHeight,
}: UseRowPinningByCountProps<TData>): RowPinningState => {
  const containerHeight =
    gridRef.current?.getBoundingClientRect().height ?? window.innerHeight;

  return useMemo(() => {
    const maxHeight = containerHeight * 0.8;

    const candidateSizes = [HEADER_HEIGHT];
    const cap = Math.min(top, sortedRows.length);
    for (let index = 0; index < cap; index++) {
      candidateSizes.push(getRowHeight(index));
    }

    const includedCount = countWithinLimit(candidateSizes, maxHeight);
    const pinnedRowsCount = Math.max(0, includedCount - 1);

    const topIds = sortedRows.slice(0, pinnedRowsCount).map((row) => row.id);

    return { top: topIds };
  }, [containerHeight, sortedRows, top, getRowHeight]);
};

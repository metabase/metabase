import type { Row, RowPinningState } from "@tanstack/react-table";
import type { RefObject } from "react";
import { useMemo } from "react";

import { HEADER_HEIGHT } from "../constants";
import { countWithinLimit } from "../utils/count-within-limit";

type UseRowPinningByCountProps<TData> = {
  top?: number;
  data: TData[];
  getRowId: (originalRow: TData, index: number, parent?: Row<TData>) => string;
  gridRef: RefObject<HTMLDivElement | null>;
  getRowHeight: (index: number) => number;
};

export const useRowPinningByCount = <TData>({
  top = 0,
  data,
  getRowId,
  gridRef,
  getRowHeight,
}: UseRowPinningByCountProps<TData>): RowPinningState => {
  const containerHeight =
    gridRef.current?.getBoundingClientRect().height ?? window.innerHeight;

  return useMemo(() => {
    const maxHeight = containerHeight * 0.8;

    const candidateSizes = [HEADER_HEIGHT];
    const cap = Math.min(top, data.length);
    for (let index = 0; index < cap; index++) {
      candidateSizes.push(getRowHeight(index));
    }

    const includedCount = countWithinLimit(candidateSizes, maxHeight);
    const pinnedRowsCount = Math.max(0, includedCount - 1);

    const topIds = data
      .slice(0, pinnedRowsCount)
      .map((row, index) => getRowId(row, index));

    return { top: topIds };
  }, [containerHeight, data, top, getRowHeight, getRowId]);
};

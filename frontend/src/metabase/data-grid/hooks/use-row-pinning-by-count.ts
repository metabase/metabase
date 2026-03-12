import type { Row, RowPinningState } from "@tanstack/react-table";
import { useMemo } from "react";

type UseRowPinningByCountProps<TData> = {
  top?: number;
  data: TData[];
  getRowId: (originalRow: TData, index: number, parent?: Row<TData>) => string;
};

export const useRowPinningByCount = <TData>({
  top = 0,
  data,
  getRowId,
}: UseRowPinningByCountProps<TData>): RowPinningState => {
  return useMemo(() => {
    const topIds = data.slice(0, top).map((row, index) => getRowId(row, index));
    return { top: topIds };
  }, [top, data, getRowId]);
};

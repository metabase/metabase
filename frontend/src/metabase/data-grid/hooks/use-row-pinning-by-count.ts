import type { RowPinningState } from "@tanstack/react-table";
import type { CoreOptions } from "@tanstack/table-core/src/core/table";
import { useMemo } from "react";

type UseRowPinningByCountProps<TData> = {
  top?: number;
  bottom?: number;
  data: TData[];
  getRowId: NonNullable<CoreOptions<TData>["getRowId"]>;
};

export const useRowPinningByCount = <TData>({
  top = 0,
  bottom = 0,
  data,
  getRowId,
}: UseRowPinningByCountProps<TData>): RowPinningState =>
  useMemo(() => {
    const topIds = data.slice(0, top).map((row, index) => getRowId(row, index));

    const bottomShift = data.length - bottom;
    const bottomIds = data
      .slice(bottomShift)
      .map((row, index) => getRowId(row, bottomShift + index));
    return { top: topIds, bottom: bottomIds };
  }, [top, bottom, data, getRowId]);

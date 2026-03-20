import type {
  ColumnPinningState,
  ColumnSizingState,
} from "@tanstack/react-table";
import { type RefObject, useMemo, useState } from "react";

import { countWithinLimit } from "../utils/count-within-limit";

type UseColumnPinningByCountProps = {
  gridRef: RefObject<HTMLDivElement>;
  pinnedColumnsCount: number;
  columnSizingMap: ColumnSizingState;
  columnOrder: string[];
};

export const useColumnPinningByCount = ({
  gridRef,
  pinnedColumnsCount,
  columnOrder,
  columnSizingMap,
}: UseColumnPinningByCountProps) => {
  const [isLimitBypassed, setIsLimitBypassed] = useState<boolean>(false);

  const containerWidth =
    gridRef.current?.getBoundingClientRect().width ?? window.innerWidth;

  const columnPinning = useMemo<ColumnPinningState>(() => {
    if (isLimitBypassed) {
      return { left: columnOrder.slice(0, pinnedColumnsCount) };
    }

    const maxWidth = containerWidth * 0.9;

    const effectiveCount = countWithinLimit(
      columnOrder
        .slice(0, pinnedColumnsCount)
        .map((id) => columnSizingMap[id] ?? 0),
      maxWidth,
    );

    return { left: columnOrder.slice(0, effectiveCount) };
  }, [
    isLimitBypassed,
    containerWidth,
    pinnedColumnsCount,
    columnOrder,
    columnSizingMap,
  ]);

  return { columnPinning, toggle: setIsLimitBypassed };
};

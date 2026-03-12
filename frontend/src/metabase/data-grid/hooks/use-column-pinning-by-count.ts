import type {
  ColumnPinningState,
  ColumnSizingState,
} from "@tanstack/react-table";
import { type RefObject, useMemo, useState } from "react";

import { useItemsLimiter } from "./use-items-limiter";

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
  const [isEnabled, setIsEnabled] = useState<boolean>(false);

  const pinnedColumnSizes = useMemo(() => {
    return columnOrder
      .slice(0, pinnedColumnsCount)
      .map((id) => columnSizingMap[id] ?? 0);
  }, [columnOrder, pinnedColumnsCount, columnSizingMap]);

  const effectivePinnedColumnsCount = useItemsLimiter({
    containerRef: gridRef,
    dimension: "width",
    sizes: pinnedColumnSizes,
    maxRatio: 0.9,
    isEnabled,
  });

  const columnPinning = useMemo<ColumnPinningState>(
    () => ({
      left: columnOrder.slice(0, effectivePinnedColumnsCount),
    }),
    [columnOrder, effectivePinnedColumnsCount],
  );

  return { columnPinning, toggle: setIsEnabled };
};

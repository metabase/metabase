import type {
  ColumnPinningState,
  ColumnSizingState,
} from "@tanstack/react-table";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import _ from "underscore";

import { MIN_COLUMN_WIDTH } from "metabase/data-grid/constants";

type UseColumnPinningByCountProps = {
  pinnedLeftColumnsCount: number;
  columnOrder: string[];
  hasRowIdColumn: boolean;
  hasColumnRowSelectColumn: boolean;
  gridRef: React.RefObject<HTMLDivElement>;
  columnSizingMap: ColumnSizingState;
};

export const useColumnPinningByCount = ({
  pinnedLeftColumnsCount,
  columnOrder,
  hasRowIdColumn,
  hasColumnRowSelectColumn,
  gridRef,
  columnSizingMap,
}: UseColumnPinningByCountProps): ColumnPinningState => {
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) {
      return;
    }
    const handleResize = _.debounce(setContainerWidth, 100);
    const observer = new ResizeObserver((entries) => {
      handleResize(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridRef.current]);

  return useMemo(() => {
    const requestedCount =
      pinnedLeftColumnsCount +
      (hasRowIdColumn ? 1 : 0) +
      (hasColumnRowSelectColumn ? 1 : 0);

    if (!containerWidth) {
      return { left: columnOrder.slice(0, requestedCount) };
    }

    let effectiveCount = requestedCount;
    while (effectiveCount > 0) {
      const pinnedWidth = columnOrder
        .slice(0, effectiveCount)
        .reduce(
          (sum, colId) => sum + (columnSizingMap[colId] ?? MIN_COLUMN_WIDTH),
          0,
        );

      if (pinnedWidth + MIN_COLUMN_WIDTH <= containerWidth) {
        break;
      }
      effectiveCount--;
    }

    return { left: columnOrder.slice(0, effectiveCount) };
  }, [
    columnOrder,
    pinnedLeftColumnsCount,
    hasRowIdColumn,
    hasColumnRowSelectColumn,
    containerWidth,
    columnSizingMap,
  ]);
};

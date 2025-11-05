import type { ColumnSizingState } from "@tanstack/react-table";
import { useLayoutEffect, useRef } from "react";
import { usePrevious } from "react-use";

import { maybeExpandColumnWidths } from "../utils/maybe-expand-column-widths";

interface useExpandColumnsToMinGridWidthProps {
  minGridWidth?: number;
  columnSizingMap: ColumnSizingState;
  setColumnSizingMap: (sizingMap: ColumnSizingState) => void;
  fixedWidthColumnIds: string[];
}

/**
 * A hook that expands column widths to meet a minimum grid width requirement.
 *
 * This hook monitors changes to the minimum grid width and automatically adjusts
 * the width of resizable columns to ensure the total grid width meets or exceeds
 * the specified minimum width. It preserves the original column widths before any
 * expansion to use as a baseline for recalculation when the minimum width changes.
 *
 * @param {Object} props - Hook properties
 * @param {number} props.minGridWidth - The minimum width the grid should maintain
 * @param {ColumnSizingState} props.columnSizingMap - Current mapping of column IDs to their widths
 * @param {Function} props.setColumnSizingMap - Function to update column sizing state
 * @param {string[]} props.fixedWidthColumnIds - Array of column IDs that should not be resized
 */
export const useExpandColumnsToMinGridWidth = ({
  minGridWidth,
  columnSizingMap,
  setColumnSizingMap,
  fixedWidthColumnIds,
}: useExpandColumnsToMinGridWidthProps) => {
  const prevMinGridWidth = usePrevious(minGridWidth);
  // Store original column widths before any expansion
  const preExpandedColumnWidths = useRef<ColumnSizingState>();

  /**
   * Expands column widths while respecting fixed-width columns
   */
  const expandColumnWidths = (initialColumnWidths: ColumnSizingState) => {
    setColumnSizingMap(
      maybeExpandColumnWidths(
        initialColumnWidths,
        fixedWidthColumnIds,
        minGridWidth,
      ),
    );
  };

  // Trigger column expansion when minGridWidth is set or changes
  useLayoutEffect(() => {
    if (!minGridWidth || minGridWidth === prevMinGridWidth) {
      return;
    }

    // Save original column widths on first run
    if (preExpandedColumnWidths.current == null) {
      preExpandedColumnWidths.current = columnSizingMap;
    }
    expandColumnWidths(preExpandedColumnWidths.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minGridWidth]);
};

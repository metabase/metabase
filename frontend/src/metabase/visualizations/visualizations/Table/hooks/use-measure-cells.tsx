import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import _ from "underscore";

import type { DatasetColumn, RowValue } from "metabase-types/api";

interface MeasureCellsOptions {
  columns: DatasetColumn[];
  rows: RowValue[][];
  renderCell: (props: {
    row: RowValue;
    column: DatasetColumn;
  }) => React.ReactNode;
  renderHeaderCell: (props: { column: DatasetColumn }) => React.ReactNode;
  enableWrapping?: boolean;
}

interface MeasureResult {
  columnWidths: number[];
  rowHeights?: number[];
}

const MIN_COLUMN_WIDTH = 50;
const DEFAULT_ROW_HEIGHT = 36;

const createMeasureContainer = () => {
  const div = document.createElement("div");
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.zIndex = "-1";
  div.style.top = "-9999px";
  div.style.left = "-9999px";
  document.body.appendChild(div);
  return div;
};

const renderToString = (node: React.ReactNode): string => {
  if (node == null) {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (typeof node === "boolean") {
    return "";
  }
  if (Array.isArray(node)) {
    return node.map(renderToString).join("");
  }
  if (typeof node === "object") {
    if ("props" in node && "children" in node.props) {
      return renderToString(node.props.children);
    }
    return "";
  }
  return "";
};

const getCacheKey = (columns: DatasetColumn[], rows: RowValue[][]) => {
  return (
    JSON.stringify(columns.map(col => col.name)) +
    JSON.stringify(rows.map(row => row.map(value => value)))
  );
};

export const useMeasureCells = ({
  columns,
  rows,
  renderCell,
  renderHeaderCell,
  enableWrapping = false,
}: MeasureCellsOptions): MeasureResult => {
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const [rowHeights, setRowHeights] = useState<number[]>();
  const measureContainerRef = useRef<HTMLDivElement | null>(null);
  const measurementCacheRef = useRef<{
    cacheKey: string;
    columnWidths: number[];
    rowHeights?: number[];
  } | null>(null);
  const measureTimeoutRef = useRef<number>();

  // Pick sample rows for measurement (up to 10 non-null rows per column)
  const sampleRowIndices = useMemo(() => {
    return columns.map((_column, columnIndex) => {
      const indices: number[] = [];
      for (let i = 0; i < rows.length && indices.length < 10; i++) {
        const row = rows[i];
        const value = row[columnIndex];
        if (value != null) {
          indices.push(i);
        }
      }
      return indices;
    });
  }, [columns, rows]);

  const measure = useCallback(() => {
    if (measureTimeoutRef.current) {
      window.clearTimeout(measureTimeoutRef.current);
    }

    measureTimeoutRef.current = window.setTimeout(() => {
      // Check if we already have measurements for these columns/rows
      const cacheKey = getCacheKey(columns, rows);
      const cache = measurementCacheRef.current;
      if (cache && cache.cacheKey === cacheKey) {
        setColumnWidths(cache.columnWidths);
        setRowHeights(cache.rowHeights);
        return;
      }

      const container = measureContainerRef.current;
      if (!container) {
        return;
      }

      const newColumnWidths: number[] = [];
      const newRowHeights: number[] = enableWrapping ? [] : [];

      columns.forEach((column, columnIndex) => {
        const columnDiv = document.createElement("div");
        columnDiv.style.display = "inline-block";
        columnDiv.style.position = "absolute";
        columnDiv.style.whiteSpace = enableWrapping ? "normal" : "nowrap";
        if (enableWrapping) {
          columnDiv.style.width = "300px";
        }

        // Measure header
        const headerContent = renderToString(renderHeaderCell({ column }));
        columnDiv.textContent = headerContent;
        container.appendChild(columnDiv);
        let maxWidth = columnDiv.offsetWidth;

        // Measure sample rows
        sampleRowIndices[columnIndex].forEach(rowIndex => {
          const cellContent = renderToString(
            renderCell({ row: rows[rowIndex], column }),
          );
          columnDiv.textContent = cellContent;
          maxWidth = Math.max(maxWidth, columnDiv.offsetWidth);

          if (enableWrapping) {
            newRowHeights[rowIndex] = Math.max(
              newRowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT,
              columnDiv.offsetHeight,
            );
          }
        });

        container.removeChild(columnDiv);
        newColumnWidths[columnIndex] = Math.max(maxWidth, MIN_COLUMN_WIDTH);
      });

      // Cache measurements
      measurementCacheRef.current = {
        cacheKey,
        columnWidths: newColumnWidths,
        rowHeights: enableWrapping ? newRowHeights : undefined,
      };

      setColumnWidths(newColumnWidths);
      if (enableWrapping) {
        setRowHeights(newRowHeights);
      }
    }, 0);
  }, [
    columns,
    rows,
    sampleRowIndices,
    renderCell,
    renderHeaderCell,
    enableWrapping,
  ]);

  useLayoutEffect(() => {
    if (!measureContainerRef.current) {
      measureContainerRef.current = createMeasureContainer();
    }
    measure();
    return () => {
      if (measureContainerRef.current) {
        document.body.removeChild(measureContainerRef.current);
        measureContainerRef.current = null;
      }
      if (measureTimeoutRef.current) {
        window.clearTimeout(measureTimeoutRef.current);
      }
    };
  }, [measure]);

  return { columnWidths, rowHeights };
};

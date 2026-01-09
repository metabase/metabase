import { type Row, type Table, flexRender } from "@tanstack/react-table";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Root } from "react-dom/client";

import {
  MeasurementProviders,
  createMeasurementContainer,
  removeMeasurementContainer,
} from "metabase/data-grid/utils/measure-utils";
import { renderRoot } from "metabase/lib/react-compat";
import { SortableHeaderPill } from "metabase/ui";

import {
  CELL_HORIZONTAL_PADDING,
  DEFAULT_INDENT_WIDTH,
  EXPAND_BUTTON_WIDTH,
  LONGEST_VALUES_SAMPLE_COUNT,
  MEASUREMENT_ROW_COUNT,
  MIN_COLUMN_WIDTH,
  TREE_CELL_BASE_PADDING,
} from "../constants";
import type {
  TreeNodeData,
  TreeTableColumnDef,
  TreeTableColumnSizing,
} from "../types";

interface UseColumnSizingOptions<TData extends TreeNodeData> {
  columns: TreeTableColumnDef<TData>[];
  table: Table<TData>;
  indentWidth?: number;
}

export function needsMeasurement<TData extends TreeNodeData>(
  column: TreeTableColumnDef<TData>,
): boolean {
  return column.minWidth === "auto" || column.width === "auto";
}

// Find K rows with longest string values to measure content width for the column.
function getRowsWithLongestValues<TData extends TreeNodeData>(
  rows: Row<TData>[],
  column: TreeTableColumnDef<TData>,
  excludeIds: Set<string>,
): Row<TData>[] {
  const topK: Array<{ row: Row<TData>; length: number }> = [];

  for (const row of rows) {
    if (excludeIds.has(row.id)) {
      continue;
    }

    const value = row.getValue(column.id);
    if (value == null) {
      continue;
    }

    const length = String(value).length;

    if (topK.length < LONGEST_VALUES_SAMPLE_COUNT) {
      topK.push({ row, length });
      continue;
    }

    let minIndex = 0;
    for (let i = 1; i < topK.length; i++) {
      if (topK[i].length < topK[minIndex].length) {
        minIndex = i;
      }
    }

    if (length > topK[minIndex].length) {
      topK[minIndex] = { row, length };
    }
  }

  return topK.map((c) => c.row);
}

// Pick rows to measure for column width: first N rows + rows with longest stringified values.
// Combining both catches typical content and outliers without measuring all rows.
function pickTreeRowsToMeasure<TData extends TreeNodeData>(
  rows: Row<TData>[],
  column: TreeTableColumnDef<TData>,
  count: number = MEASUREMENT_ROW_COUNT,
): Row<TData>[] {
  const result: Row<TData>[] = [];

  for (const row of rows) {
    if (row.getValue(column.id) != null) {
      result.push(row);
      if (result.length >= count) {
        break;
      }
    }
  }

  const sampledIds = new Set(result.map((r) => r.id));
  const longestRows = getRowsWithLongestValues(rows, column, sampledIds);
  result.push(...longestRows);

  return result;
}

function getContentWidth<TData extends TreeNodeData>(
  column: TreeTableColumnDef<TData>,
  contentWidths: Record<string, number>,
): number {
  const baseWidth = contentWidths[column.id] ?? MIN_COLUMN_WIDTH;
  const padding = column.widthPadding ?? 0;
  let width = baseWidth + padding;
  if (column.maxAutoWidth != null) {
    width = Math.min(width, column.maxAutoWidth);
  }
  return width;
}

export function getMinConstraint<TData extends TreeNodeData>(
  column: TreeTableColumnDef<TData>,
  colIndex: number,
  contentWidths: Record<string, number>,
  maxDepth: number,
  indentWidth: number,
): number {
  let minConstraint: number;
  if (column.minWidth === "auto") {
    minConstraint = getContentWidth(column, contentWidths);
  } else if (typeof column.minWidth === "number") {
    minConstraint = column.minWidth;
  } else {
    minConstraint = MIN_COLUMN_WIDTH;
  }

  if (colIndex === 0) {
    const maxIndentPadding = maxDepth * indentWidth;
    minConstraint = Math.max(
      minConstraint,
      MIN_COLUMN_WIDTH + maxIndentPadding,
    );
  }

  return minConstraint;
}

export function calculateColumnWidths<TData extends TreeNodeData>(
  columns: TreeTableColumnDef<TData>[],
  containerWidth: number,
  contentWidths: Record<string, number>,
  maxDepth: number,
  indentWidth: number,
): Record<string, number> {
  if (containerWidth <= 0) {
    return {};
  }

  const widths: Record<string, number> = {};

  // Calculate fixed widths: numeric width or "auto" (measured from content)
  const fixedWidth = columns
    .filter((col) => col.width != null)
    .reduce((sum, col) => {
      if (col.width === "auto") {
        let width = getContentWidth(col, contentWidths);
        if (col.maxWidth != null) {
          width = Math.min(width, col.maxWidth);
        }
        return sum + width;
      }
      return sum + (col.width ?? 0);
    }, 0);

  let remainingSpace = containerWidth - fixedWidth;

  // Columns without width are stretching columns
  const stretchingColumnIds = new Set(
    columns.filter((col) => col.width == null).map((col) => col.id),
  );

  // Set fixed widths
  columns.forEach((column) => {
    if (column.width != null) {
      if (column.width === "auto") {
        let width = getContentWidth(column, contentWidths);
        if (column.maxWidth != null) {
          width = Math.min(width, column.maxWidth);
        }
        widths[column.id] = width;
      } else {
        widths[column.id] = column.width;
      }
    }
  });

  while (stretchingColumnIds.size > 0) {
    const baseWidth = Math.floor(remainingSpace / stretchingColumnIds.size);
    let anyConstrained = false;

    for (const colId of stretchingColumnIds) {
      const colIndex = columns.findIndex((c) => c.id === colId);
      const column = columns[colIndex];
      const minConstraint = getMinConstraint(
        column,
        colIndex,
        contentWidths,
        maxDepth,
        indentWidth,
      );

      if (baseWidth < minConstraint) {
        widths[colId] = minConstraint;
        remainingSpace -= minConstraint;
        stretchingColumnIds.delete(colId);
        anyConstrained = true;
        break;
      }

      if (column.maxWidth != null && baseWidth > column.maxWidth) {
        widths[colId] = column.maxWidth;
        remainingSpace -= column.maxWidth;
        stretchingColumnIds.delete(colId);
        anyConstrained = true;
        break;
      }
    }

    if (!anyConstrained) {
      for (const colId of stretchingColumnIds) {
        widths[colId] = baseWidth;
      }
      break;
    }
  }

  return widths;
}

interface MeasureContentProps<TData extends TreeNodeData> {
  columns: TreeTableColumnDef<TData>[];
  rows: Row<TData>[];
  table: Table<TData>;
  hasExpandableNodes: boolean;
  indentWidth: number;
  onMeasured: (widths: Record<string, number>, maxDepth: number) => void;
}

function MeasureContent<TData extends TreeNodeData>({
  columns,
  rows,
  table,
  hasExpandableNodes,
  indentWidth,
  onMeasured,
}: MeasureContentProps<TData>) {
  const handleRef = useCallback(
    (div: HTMLDivElement | null) => {
      if (!div) {
        return;
      }

      const widths: Record<string, number> = {};
      let maxDepth = 0;

      for (const row of rows) {
        maxDepth = Math.max(maxDepth, row.depth);
      }

      columns.forEach((column, colIndex) => {
        const columnEl = div.querySelector(
          `[data-measure-column="${column.id}"]`,
        );
        if (!columnEl) {
          return;
        }

        const cellEls = columnEl.querySelectorAll("[data-measure-cell]");
        let maxWidth = 0;

        cellEls.forEach((cellEl) => {
          const depth = parseInt(cellEl.getAttribute("data-depth") ?? "0", 10);
          let cellWidth = Math.ceil(cellEl.getBoundingClientRect().width);

          cellWidth += CELL_HORIZONTAL_PADDING;

          if (colIndex === 0) {
            cellWidth += TREE_CELL_BASE_PADDING;
            if (hasExpandableNodes) {
              cellWidth += EXPAND_BUTTON_WIDTH;
            }
            cellWidth += depth * indentWidth;
          }

          maxWidth = Math.max(maxWidth, cellWidth);
        });

        const headerEl = columnEl.querySelector("[data-measure-header]");
        if (headerEl) {
          const headerWidth =
            Math.ceil(headerEl.getBoundingClientRect().width) +
            CELL_HORIZONTAL_PADDING;
          maxWidth = Math.max(maxWidth, headerWidth);
        }

        widths[column.id] = maxWidth;
      });

      onMeasured(widths, maxDepth);
    },
    [columns, rows, hasExpandableNodes, indentWidth, onMeasured],
  );

  const columnsToMeasure = columns.filter(needsMeasurement);

  return (
    <div ref={handleRef} style={{ display: "flex" }}>
      {columnsToMeasure.map((column) => {
        const colIndex = columns.findIndex((c) => c.id === column.id);
        const rowsToMeasure = pickTreeRowsToMeasure(rows, column);

        return (
          <div
            key={column.id}
            data-measure-column={column.id}
            style={{ display: "flex", flexDirection: "column" }}
          >
            {typeof column.header === "string" && (
              <div data-measure-header style={{ whiteSpace: "nowrap" }}>
                <SortableHeaderPill name={column.header} />
              </div>
            )}
            {rowsToMeasure.map((row) => {
              const cell = row
                .getVisibleCells()
                .find((c) => c.column.id === column.id);
              if (!cell) {
                return null;
              }

              const tanstackColumn = table.getColumn(column.id);
              const columnDef = tanstackColumn?.columnDef;

              const cellContent = columnDef?.cell
                ? flexRender(columnDef.cell, cell.getContext())
                : String(cell.getValue() ?? "");

              return (
                <div
                  key={row.id}
                  data-measure-cell
                  data-depth={colIndex === 0 ? row.depth : 0}
                  style={{ whiteSpace: "nowrap", width: "fit-content" }}
                >
                  {cellContent}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function useColumnSizing<TData extends TreeNodeData>({
  columns,
  table,
  indentWidth = DEFAULT_INDENT_WIDTH,
}: UseColumnSizingOptions<TData>): TreeTableColumnSizing {
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidths, setContentWidths] = useState<Record<string, number>>(
    {},
  );
  const [maxDepth, setMaxDepth] = useState(0);
  const [isMeasured, setIsMeasured] = useState(false);
  const measureRootRef = useRef<{
    element: HTMLDivElement;
    tree: Root | undefined;
  } | null>(null);

  const allRows = table.getRowModel().flatRows;

  const hasExpandableNodes = useMemo(() => {
    return allRows.some((row) => row.getCanExpand());
  }, [allRows]);

  const columnsRef = useRef(columns);
  const allRowsRef = useRef(allRows);
  const tableRef = useRef(table);
  columnsRef.current = columns;
  allRowsRef.current = allRows;
  tableRef.current = table;

  const columnsNeedingMeasurement = useMemo(
    () => columns.filter(needsMeasurement),
    [columns],
  );

  const measurementColumnsKey = columnsNeedingMeasurement
    .map((c) => c.id)
    .join(",");
  const rowsLength = allRows.length;

  const handleMeasured = useCallback(
    (widths: Record<string, number>, depth: number) => {
      setContentWidths(widths);
      setMaxDepth(depth);
      setIsMeasured(true);

      if (measureRootRef.current) {
        const { element, tree } = measureRootRef.current;
        removeMeasurementContainer(element, tree);
        measureRootRef.current = null;
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const currentRows = allRowsRef.current;
    const currentColumns = columnsRef.current;
    const currentTable = tableRef.current;
    const columnsToMeasure = currentColumns.filter(needsMeasurement);

    if (columnsToMeasure.length === 0) {
      let depth = 0;
      for (const row of currentRows) {
        depth = Math.max(depth, row.depth);
      }
      setMaxDepth(depth);
      setIsMeasured(true);
      return;
    }

    if (currentRows.length === 0) {
      setIsMeasured(true);
      return;
    }

    const measureElement = createMeasurementContainer({ fontSize: "14px" });

    const content = (
      <MeasurementProviders>
        <MeasureContent
          columns={currentColumns}
          rows={currentRows}
          table={currentTable}
          hasExpandableNodes={hasExpandableNodes}
          indentWidth={indentWidth}
          onMeasured={handleMeasured}
        />
      </MeasurementProviders>
    );

    const tree = renderRoot(content, measureElement);
    measureRootRef.current = { element: measureElement, tree };
  }, [
    measurementColumnsKey,
    rowsLength,
    hasExpandableNodes,
    indentWidth,
    handleMeasured,
  ]);

  useLayoutEffect(() => {
    return () => {
      if (measureRootRef.current) {
        const { element, tree } = measureRootRef.current;
        removeMeasurementContainer(element, tree);
        measureRootRef.current = null;
      }
    };
  }, []);

  const columnWidths = useMemo(() => {
    return calculateColumnWidths(
      columns,
      containerWidth,
      contentWidths,
      maxDepth,
      indentWidth,
    );
  }, [columns, containerWidth, contentWidths, maxDepth, indentWidth]);

  const hasStretchingColumns = columns.some((col) => col.width == null);
  const isFullyMeasured = hasStretchingColumns
    ? isMeasured && containerWidth > 0
    : isMeasured;

  return { columnWidths, setContainerWidth, isMeasured: isFullyMeasured };
}

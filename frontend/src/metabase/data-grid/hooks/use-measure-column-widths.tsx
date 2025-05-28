import {
  type ColumnSizingState,
  type Table as ReactTable,
  flexRender,
} from "@tanstack/react-table";
import React, { useCallback } from "react";
import type { Root } from "react-dom/client";

import type { ColumnOptions, DataGridTheme } from "metabase/data-grid/types";
import { pickRowsToMeasure } from "metabase/data-grid/utils/column-sizing";
import { renderRoot } from "metabase/lib/react-compat";
import { isNotNull } from "metabase/lib/types";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui";

import { DEFAULT_FONT_SIZE } from "../constants";

import { DataGridThemeProvider } from "./use-table-theme";

const HEADER_SPACING = 16;
const BODY_SPACING = 2;

/**
 * Hook for measuring optimal column widths for a data grid
 *
 * Works by rendering a hidden copy of table headers and a selection of cell content,
 * measuring their rendered width, and determining appropriate column widths that
 * accommodate both headers and content.
 *
 * @param table ReactTable instance
 * @param columnsOptions Column configuration options
 * @param theme DataGrid theme settings
 * @param measurementRenderWrapper Optional wrapper for the measurement render
 * @returns Function that triggers width measurement and returns promised column sizing
 */
export const useMeasureColumnWidths = <TData, TValue>(
  table: ReactTable<TData>,
  columnsOptions: ColumnOptions<TData, TValue>[],
  theme: DataGridTheme | undefined,
  measurementRenderWrapper?: (
    children: React.ReactElement,
  ) => React.ReactElement,
) => {
  const measureColumnWidths = useCallback(
    (
      onMeasured: (columnSizingState: ColumnSizingState) => void,
      skipColumnIds: string[] = [],
    ) => {
      // Create hidden container for measurement rendering
      const measureRoot = document.createElement("div");
      let measureRootTree: Root | undefined = undefined;
      measureRoot.style.position = "absolute";
      measureRoot.style.top = "-9999px";
      measureRoot.style.left = "-9999px";
      measureRoot.style.visibility = "hidden";
      measureRoot.style.pointerEvents = "none";
      measureRoot.style.zIndex = "-999";
      measureRoot.style.fontSize = DEFAULT_FONT_SIZE;
      document.body.appendChild(measureRoot);

      const skipColumnIdsSet = new Set(skipColumnIds);

      const onMeasureHeaderRender = (div: HTMLDivElement) => {
        if (div === null) {
          return;
        }

        // Extract width measurements from rendered elements
        const elementsMeasures = Array.from(
          div.querySelectorAll("[data-measure-id]"),
        )
          .map((element) => {
            const columnId = element.getAttribute("data-measure-id");
            const type = element.getAttribute("data-measure-type");

            if (columnId == null) {
              return null;
            }

            const width = (element as HTMLElement).offsetWidth;
            return { columnId, width, type };
          })
          .filter(isNotNull);

        // Calculate column widths based on measurements
        const measuredColumnSizingMap =
          elementsMeasures.reduce<ColumnSizingState>(
            (acc, { columnId, width, type }) => {
              if (!acc[columnId]) {
                acc[columnId] = 0;
              }

              // Add appropriate spacing based on element type
              if (type === "header") {
                const headerWidth = width + HEADER_SPACING;
                acc[columnId] = Math.max(acc[columnId], headerWidth);
              } else if (type === "body") {
                const bodyWidth = width + BODY_SPACING;
                acc[columnId] = Math.max(acc[columnId], bodyWidth);
              }

              return acc;
            },
            {},
          );

        onMeasured(measuredColumnSizingMap);

        // Asynchronously unmount the root after the current render has completed to avoid race conditions.
        setTimeout(() => {
          measureRootTree?.unmount();
          document.body.removeChild(measureRoot);
        }, 0);
      };

      const rows = table.getRowModel().rows;
      const rowsData = rows.map((row) => row.original);

      // Render hidden elements for measurement
      const measureContent = (
        <div style={{ display: "flex" }} ref={onMeasureHeaderRender}>
          {table
            .getHeaderGroups()
            .flatMap((headerGroup) => headerGroup.headers)
            .filter((header) => !skipColumnIdsSet.has(header.column.id))
            .map((header) => {
              const headerCell = flexRender(
                header.column.columnDef.header,
                header.getContext(),
              );
              return (
                <div
                  key={header.column.id}
                  data-measure-id={header.column.id}
                  data-measure-type="header"
                >
                  {headerCell}
                </div>
              );
            })}

          {columnsOptions.map((columnOptions) => {
            return (
              <div
                key={columnOptions.id}
                data-measure-id={columnOptions.id}
                data-measure-type="body"
              >
                {pickRowsToMeasure(rowsData, columnOptions.accessorFn).map(
                  (rowIndex) => {
                    const cell = rows[rowIndex]
                      .getVisibleCells()
                      .find(
                        (cell) =>
                          cell.column.id === columnOptions.id &&
                          !skipColumnIdsSet.has(cell.column.id),
                      );

                    if (!cell) {
                      return null;
                    }

                    return (
                      <React.Fragment key={`${columnOptions.id}-${rowIndex}`}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </React.Fragment>
                    );
                  },
                )}
              </div>
            );
          })}
        </div>
      );

      // Wrap measurement content with necessary providers
      const wrappedContent = (
        <EmotionCacheProvider>
          <ThemeProvider>
            <DataGridThemeProvider theme={theme}>
              {measureContent}
            </DataGridThemeProvider>
          </ThemeProvider>
        </EmotionCacheProvider>
      );

      const content = measurementRenderWrapper
        ? measurementRenderWrapper(wrappedContent)
        : wrappedContent;

      measureRootTree = renderRoot(content, measureRoot);
    },
    [table, columnsOptions, theme, measurementRenderWrapper],
  );

  return measureColumnWidths;
};

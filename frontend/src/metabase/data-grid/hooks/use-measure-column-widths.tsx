import {
  type ColumnSizingState,
  type Table as ReactTable,
  flexRender,
} from "@tanstack/react-table";
import React, { useCallback } from "react";
import type { Root } from "react-dom/client";

import type { ColumnOptions, DataGridTheme } from "metabase/data-grid/types";
import { pickRowsToMeasure } from "metabase/data-grid/utils/column-sizing";
import {
  MeasurementProviders,
  createMeasurementContainer,
} from "metabase/data-grid/utils/measure-utils";
import { renderRoot, unmountRoot } from "metabase/lib/react-compat";
import { isNotNull } from "metabase/lib/types";

import { DataGridThemeProvider } from "./use-table-theme";

const CELL_BORDER_WIDTHS = 2;

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
    (onMeasured: (columnSizingState: ColumnSizingState) => void) => {
      const measureRoot = createMeasurementContainer();
      let measureRootTree: Root | undefined = undefined;

      const onMeasureHeaderRender = (div: HTMLDivElement) => {
        if (div === null) {
          return;
        }

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

        const measuredColumnSizingMap =
          elementsMeasures.reduce<ColumnSizingState>(
            (acc, { columnId, width, type }) => {
              if (!acc[columnId]) {
                acc[columnId] = 0;
              }

              if (type === "header") {
                const headerWidth = width + CELL_BORDER_WIDTHS;
                acc[columnId] = Math.max(acc[columnId], headerWidth);
              } else if (type === "body") {
                const bodyWidth = width + CELL_BORDER_WIDTHS;
                acc[columnId] = Math.max(acc[columnId], bodyWidth);
              }

              return acc;
            },
            {},
          );

        onMeasured(measuredColumnSizingMap);

        setTimeout(() => {
          unmountRoot(measureRootTree, measureRoot);
          document.body.removeChild(measureRoot);
        }, 0);
      };

      const rows = table.getRowModel().rows;
      const rowsData = rows.map((row) => row.original);

      const measureContent = (
        <div style={{ display: "flex" }} ref={onMeasureHeaderRender}>
          {table
            .getHeaderGroups()
            .flatMap((headerGroup) => headerGroup.headers)
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
                  style={{
                    minWidth: header.column.columnDef.minSize,
                  }}
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
                      .find((cell) => cell.column.id === columnOptions.id);

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

      const wrappedContent = (
        <MeasurementProviders>
          <DataGridThemeProvider theme={theme}>
            {measureContent}
          </DataGridThemeProvider>
        </MeasurementProviders>
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

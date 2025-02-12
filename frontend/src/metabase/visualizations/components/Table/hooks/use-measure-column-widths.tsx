import {
  type ColumnSizingState,
  type Table as ReactTable,
  flexRender,
} from "@tanstack/react-table";
import { useCallback, useEffect, useRef } from "react";
import type { Root } from "react-dom/client";
import _ from "underscore";

import { renderRoot } from "metabase/lib/react-compat";
import { isNotNull } from "metabase/lib/types";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui";

import { pickRowsToMeasure } from "../utils/measure";

import type { ColumnOptions } from "./use-table-instance";

const EXTRA_COLUMN_SPACING = 14;

const getTruncatedColumnSizing = (
  columnSizing: ColumnSizingState,
  truncateWidth: number,
): ColumnSizingState =>
  Object.fromEntries(
    Object.entries(columnSizing).map(([key, value]) => [
      key,
      Math.min(value, truncateWidth),
    ]),
  );

export const useMeasureColumnWidths = <TData, TValue>(
  table: ReactTable<TData>,
  data: TData[],
  columnsOptions: ColumnOptions<TData, TValue>[],
  setMeasuredColumnSizing: (columnSizing: ColumnSizingState) => void,
  truncateLongCellWidth: number,
) => {
  const measureRootRef = useRef<HTMLDivElement>();
  const measureRootTree = useRef<Root>();

  const measureColumnWidths = useCallback(
    (updateCurrent: boolean = true, truncate: boolean = true) => {
      const onMeasureHeaderRender = (div: HTMLDivElement) => {
        if (div === null) {
          return;
        }

        const contentWidths = Array.from(
          div.querySelectorAll("[data-measure-id]"),
        )
          .map(columnElement => {
            const columnId = columnElement.getAttribute("data-measure-id");
            if (columnId == null) {
              return null;
            }
            const width =
              (columnElement as HTMLElement).offsetWidth + EXTRA_COLUMN_SPACING;
            return { columnId, width };
          })
          .filter(isNotNull);

        const columnSizing: ColumnSizingState = contentWidths.reduce<
          Record<string, number>
        >(
          (acc, { columnId, width }) => ({
            ...acc,
            [columnId]: Math.max(width, acc[columnId] || 0),
          }),
          {},
        );

        setMeasuredColumnSizing(columnSizing);

        if (updateCurrent) {
          table.setColumnSizing(
            truncate
              ? getTruncatedColumnSizing(columnSizing, truncateLongCellWidth)
              : columnSizing,
          );
        }
      };

      const content = (
        <EmotionCacheProvider>
          <ThemeProvider>
            <div style={{ display: "flex" }} ref={onMeasureHeaderRender}>
              {table
                .getHeaderGroups()
                .flatMap(headerGroup => headerGroup.headers)
                .map(header => {
                  const headerCell = flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  );
                  return (
                    <div
                      key={header.column.id}
                      data-measure-id={header.column.id}
                    >
                      {headerCell}
                    </div>
                  );
                })}

              {columnsOptions.map(columnOptions => {
                return (
                  <div
                    key={columnOptions.id}
                    data-measure-id={columnOptions.id}
                  >
                    {pickRowsToMeasure(data, columnOptions.accessorFn).map(
                      rowIndex => {
                        const cell = table
                          .getRowModel()
                          .rows[rowIndex].getVisibleCells()
                          .find(cell => cell.column.id === columnOptions.id);

                        if (!cell) {
                          return null;
                        }

                        return flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        );
                      },
                    )}
                  </div>
                );
              })}
            </div>
          </ThemeProvider>
        </EmotionCacheProvider>
      );

      measureRootTree.current = renderRoot(content, measureRootRef.current!);
    },
    [
      columnsOptions,
      data,
      setMeasuredColumnSizing,
      table,
      truncateLongCellWidth,
    ],
  );

  useEffect(() => {
    if (!measureRootRef.current) {
      const measureRoot = document.createElement("div");
      measureRoot.style.position = "absolute";
      measureRoot.style.top = "-9999px";
      measureRoot.style.left = "-9999px";
      measureRoot.style.visibility = "hidden";
      measureRoot.style.pointerEvents = "none";
      measureRoot.style.zIndex = "-999";

      document.body.appendChild(measureRoot);
      measureRootRef.current = measureRoot;
    }

    const columnSizing = table.getState().columnSizing;
    const shouldUpdateCurrentWidths =
      !columnSizing || Object.values(columnSizing).length === 0;

    measureColumnWidths(shouldUpdateCurrentWidths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return measureColumnWidths;
};

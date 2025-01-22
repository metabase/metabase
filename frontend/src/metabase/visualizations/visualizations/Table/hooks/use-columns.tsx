import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Root } from "react-dom/client";

import { formatValue } from "metabase/lib/formatting";
import { renderRoot } from "metabase/lib/react-compat";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui";
import { cachedFormatter } from "metabase/visualizations/echarts/cartesian/utils/formatter";
import {
  getTableCellClickedObject,
  getTableClickedObjectRowData,
  getTableHeaderClickedObject,
} from "metabase/visualizations/lib/table";
import { getColumnExtent } from "metabase/visualizations/lib/utils";
import type {
  ComputedVisualizationSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { OrderByDirection } from "metabase-lib/types";
import { isFK, isNumber, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ColumnSettings,
  DatasetColumn,
  DatasetData,
  RowValue,
  RowValues,
} from "metabase-types/api";

import { BodyCell, type BodyCellVariant } from "../cell/BodyCell";
import { HeaderCell } from "../cell/HeaderCell";
import { MiniBar } from "../cell/MiniBar";
import { pickRowsToMeasure } from "../utils";

import "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    column: DatasetColumn;
    datasetIndex: number;
    wrap: boolean;
    isPivoted: boolean;
  }
}

import type { CellMeasurer } from "./use-cell-measure";
import { ColumnDef, RowData } from "@tanstack/react-table";
import { MIN_COLUMN_WIDTH } from "../constants";

// approximately 120 chars
const TRUNCATE_WIDTH = 780;

const CELL_BORDERS_WIDTH = 2;

const getBodyCellVariant = (
  column: DatasetColumn,
  settings: ColumnSettings,
): BodyCellVariant => {
  if (settings["show_mini_bar"]) {
    return "minibar";
  }

  const isPill = isPK(column) || isFK(column);
  if (isPill) {
    return "pill";
  }

  return "text";
};

interface UseColumnsProps {
  settings: ComputedVisualizationSettings;
  data: DatasetData;
  isPivoted?: boolean;
  onVisualizationClick?: VisualizationProps["onVisualizationClick"];
  measureBodyCellDimensions: CellMeasurer;
  measureHeaderCellDimensions: CellMeasurer;
  getColumnSortDirection: (columnIndex: number) => OrderByDirection | undefined;
}

export const useColumns = ({
  settings,
  onVisualizationClick,
  data,
  isPivoted = false,
  getColumnSortDirection,
  measureBodyCellDimensions,
}: UseColumnsProps) => {
  const [columnIsExpanded, setColumnIsExpanded] = useState<boolean[]>([]);

  const { cols, rows } = data;
  const columnFormatters = useMemo(() => {
    return cols.map(col => {
      const columnSettings = settings.column?.(col);
      return cachedFormatter(value =>
        formatValue(value, {
          ...columnSettings,
          column: col,
          type: "cell",
          jsx: true,
          rich: true,
        }),
      );
    });
  }, [cols, settings]);

  const savedColumnWidths = useMemo(
    () => settings["table.column_widths"] || [],
    [settings],
  );

  const [measuredColumnWidths, setMeasuredColumnWidths] = useState<number[]>(
    [],
  );
  const [columnWidths, setColumnWidths] = useState(savedColumnWidths);

  const handleExpandButtonClick = useCallback(
    (columnIndex: number, content: string) => {
      const newColumnWidth = measureBodyCellDimensions(content).width;
      const newWidths = columnWidths.slice();
      newWidths[columnIndex] = newColumnWidth;

      setColumnWidths(newWidths);
      onUpdateColumnExpanded(columnIndex);
    },
    [columnWidths, measureBodyCellDimensions],
  );

  const onUpdateColumnExpanded = useCallback(
    (columnIndex: number, isExapnded = true) => {
      setColumnIsExpanded(prev => {
        const updated = prev.slice();
        updated[columnIndex] = isExapnded;
        return updated;
      });
    },
    [columnIsExpanded],
  );

  const onResizeColumn = useCallback(
    (columnIndex: number, width: number) => {
      const newWidths = columnWidths.slice();
      newWidths[columnIndex] = Math.max(MIN_COLUMN_WIDTH, width);

      if (width > TRUNCATE_WIDTH) {
        onUpdateColumnExpanded(columnIndex, true);
      }

      setColumnWidths(newWidths);

      return newWidths;
    },
    [onUpdateColumnExpanded, columnWidths],
  );

  const columns: ColumnDef<RowValues, RowValue>[] = useMemo(() => {
    return cols.map((col, index) => {
      const columnWidth = columnWidths[index] ?? 0;
      const measuredColumnWidth = measuredColumnWidths[index] ?? 0;
      const columnSettings = settings.column?.(col) ?? {};
      const wrap = Boolean(columnSettings["text_wrapping"]);
      const align = columnSettings["text_align"] ?? "left";
      const variant = getBodyCellVariant(col, columnSettings);
      const isTruncated =
        !columnIsExpanded[index] &&
        Math.min(columnWidth, measuredColumnWidth) > TRUNCATE_WIDTH;

      return {
        id: index.toString(),
        accessorFn: (row: RowValues) => row[index],
        header: memo(props => {
          const sortDirection = getColumnSortDirection(index);
          const headerClicked = getTableHeaderClickedObject(
            data,
            index,
            isPivoted,
          );
          return (
            <HeaderCell
              name={col.display_name}
              align={align}
              sort={sortDirection}
              onClick={event => {
                onVisualizationClick?.({
                  ...headerClicked,
                  element: event.currentTarget,
                });
              }}
            />
          );
        }),
        cell: memo(
          (props: { getValue: () => RowValue; row: { index: number } }) => {
            const value = props.getValue();
            const backgroundColor = settings["table._cell_background_getter"]?.(
              value,
              props.row.index,
              col.name,
            );

            const clickedRowData = getTableClickedObjectRowData(
              [{ data }],
              props.row.index,
              index,
              isPivoted,
              data,
            );

            const clicked = getTableCellClickedObject(
              data,
              settings,
              props.row.index,
              index,
              isPivoted,
              clickedRowData,
            );

            if (variant === "minibar") {
              return (
                <MiniBar
                  value={value}
                  formatter={columnFormatters[index]}
                  extent={getColumnExtent(data.cols, data.rows, index)}
                />
              );
            }

            return (
              <BodyCell
                value={value}
                align={align}
                canExpand={!wrap && isTruncated}
                formatter={columnFormatters[index]}
                backgroundColor={backgroundColor}
                onClick={event => {
                  onVisualizationClick?.({
                    ...clicked,
                    element: event.currentTarget,
                  });
                }}
                onExpand={() => {
                  const formatter = columnFormatters[index];
                  const formattedValue = formatter(value);
                  handleExpandButtonClick(index, formattedValue);
                }}
                variant={variant}
                wrap={wrap}
              />
            );
          },
        ),
        size: isTruncated ? TRUNCATE_WIDTH : columnWidth,
        meta: {
          isPivoted,
          column: col,
          datasetIndex: index,
          wrap,
        },
      };
    });
  }, [
    cols,
    columnWidths,
    measuredColumnWidths,
    settings,
    columnIsExpanded,
    isPivoted,
    getColumnSortDirection,
    data,
    onVisualizationClick,
    columnFormatters,
  ]);

  const measureRootRef = useRef<HTMLDivElement>();
  const measureRootTree = useRef<Root>();

  const measureColumnWidths = useCallback(
    (updateCurrent: boolean) => {
      const onMeasureHeaderRender = (div: HTMLDivElement) => {
        if (div === null) {
          return;
        }

        const contentWidths = Array.from(
          div.getElementsByClassName("fake-column"),
        ).map(
          columnElement =>
            (columnElement as HTMLElement).offsetWidth + CELL_BORDERS_WIDTH,
        );

        if (updateCurrent) {
          setColumnWidths(contentWidths);
        }
        setMeasuredColumnWidths(contentWidths);
      };

      const content = (
        <EmotionCacheProvider>
          <ThemeProvider>
            <div style={{ display: "flex" }} ref={onMeasureHeaderRender}>
              {cols.map((column, columnIndex) => {
                const columnSettings = settings.column?.(column) ?? {};
                const variant = getBodyCellVariant(column, columnSettings);

                return (
                  <div className="fake-column" key={"column-" + columnIndex}>
                    <HeaderCell name={column.display_name} sort="asc" />
                    {pickRowsToMeasure(rows, columnIndex).map(rowIndex => (
                      <BodyCell
                        key={rowIndex}
                        value={rows[rowIndex][columnIndex]}
                        formatter={columnFormatters[columnIndex]}
                        variant={variant}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </ThemeProvider>
        </EmotionCacheProvider>
      );

      measureRootTree.current = renderRoot(content, measureRootRef.current!);
    },
    [cols, columnFormatters, rows, settings],
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

    const shouldUpdateCurrentWidths =
      !savedColumnWidths || savedColumnWidths.length === 0;
    measureColumnWidths(shouldUpdateCurrentWidths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    columns,
    columnFormatters,
    columnWidths,
    measureColumnWidths,
    onResizeColumn,
  };
};

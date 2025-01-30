import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Root } from "react-dom/client";
import { type CSSProperties } from "react";

import { formatValue } from "metabase/lib/formatting";
import { renderRoot } from "metabase/lib/react-compat";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui";
import { cachedFormatter } from "metabase/visualizations/echarts/cartesian/utils/formatter";
import { getColumnExtent } from "metabase/visualizations/lib/utils";
import type {
  ComputedVisualizationSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { OrderByDirection } from "metabase-lib/types";
import { isFK, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ColumnSettings,
  DatasetColumn,
  DatasetData,
  RowValue,
  RowValues,
} from "metabase-types/api";

import { BodyCell, type BodyCellVariant } from "../cell/BodyCell";
import { HeaderCell } from "../cell/HeaderCell";
import { MiniBar } from "../cell/MiniBarCell";
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
import {
  ColumnDef,
  ColumnSizingState,
  RowData,
  createColumnHelper,
} from "@tanstack/react-table";
import { INDEX_COLUMN_ID, MIN_COLUMN_WIDTH } from "../constants";

import type Question from "metabase-lib/v1/Question";

import { IndexCell } from "../cell/IndexCell";
import { IndexHeaderCell } from "../cell/IndexHeaderCell";

// approximately 120 chars
const TRUNCATE_WIDTH = 780;

const CELL_BORDERS_WIDTH = 2;

// if header is dragged fewer than than this number of pixels we consider it a click instead of a drag
const HEADER_DRAG_THRESHOLD = 5;

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
  question: Question;
  hasMetadataPopovers?: boolean;
}

const columnHelper = createColumnHelper<RowValues>();

const getColumnSizing = (
  cols: DatasetColumn[],
  widths: number[] = [],
  expandedState?: ExpandedColumnsState,
): ColumnSizingState => {
  return cols.reduce((acc: ColumnSizingState, column, index) => {
    const width = widths[index];
    if (width != null) {
      acc[column.name] =
        expandedState == null || expandedState[column.name]
          ? width
          : Math.min(width, TRUNCATE_WIDTH);
    }
    return acc;
  }, {});
};

const getColumnWidthsForSettings = (
  cols: DatasetColumn[],
  columnSizing: ColumnSizingState,
) => {
  return cols.map(col => columnSizing[col.name] ?? 0);
};

export type ExpandedColumnsState = Record<string, boolean>;

export const useColumns = ({
  settings,
  onVisualizationClick,
  data,
  isPivoted = false,
  getColumnSortDirection,
  measureBodyCellDimensions,
  question,
  hasMetadataPopovers = false,
}: UseColumnsProps) => {
  const { cols, rows } = data;

  const [expandedColumns, setExpandedColumns] = useState<ExpandedColumnsState>(
    () => {
      return cols.reduce((acc: ExpandedColumnsState, col) => {
        acc[col.name] = false;
        return acc;
      }, {});
    },
  );

  const savedColumnSizing = useMemo(
    () =>
      getColumnSizing(cols, settings["table.column_widths"], expandedColumns),
    [settings],
  );
  const [columnSizing, setColumnSizing] =
    useState<ColumnSizingState>(savedColumnSizing);
  const [measuredColumnSizing, setMeasuredColumnSizing] =
    useState<ColumnSizingState>({});

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

  const handleExpandButtonClick = useCallback(
    (columnName: string, content: string) => {
      const newColumnWidth = Math.max(
        measureBodyCellDimensions(content).width,
        measuredColumnSizing[columnName],
      );
      const newColumnSizing = { ...columnSizing, [columnName]: newColumnWidth };

      setColumnSizing(newColumnSizing);

      onUpdateColumnExpanded(columnName);
    },
    [columnSizing, measureBodyCellDimensions, measuredColumnSizing],
  );

  const onUpdateColumnExpanded = useCallback(
    (columnName: string, isExpanded = true) => {
      setExpandedColumns(prev => {
        return { ...prev, [columnName]: isExpanded };
      });
    },
    [expandedColumns],
  );

  const onResizeColumn = useCallback(
    (columnName: string, width: number) => {
      const newWidth = Math.max(MIN_COLUMN_WIDTH, width);
      const newColumnSizing = { ...columnSizing, [columnName]: newWidth };
      setColumnSizing(newColumnSizing);

      if (newWidth > TRUNCATE_WIDTH) {
        onUpdateColumnExpanded(columnName);
      }

      return getColumnWidthsForSettings(cols, columnSizing);
    },
    [onUpdateColumnExpanded, columnSizing, cols],
  );

  const columns: ColumnDef<RowValues, RowValue>[] = useMemo(() => {
    const indexColumn = columnHelper.display({
      id: INDEX_COLUMN_ID,
      size: 46,
      enableResizing: false,
      cell: props => {
        return <IndexCell rowNumber={props.row.index + 1} />;
      },
      header: () => {
        return <IndexHeaderCell />;
      },
    });
    const dataColumns = cols.map((col, index) => {
      const columnWidth = columnSizing[col.name] ?? 0;
      const measuredColumnWidth = measuredColumnSizing[col.name] ?? 0;

      const isTruncated =
        !expandedColumns[col.name] &&
        columnWidth < measuredColumnWidth &&
        measuredColumnWidth > TRUNCATE_WIDTH;

      const columnSettings = settings.column?.(col) ?? {};
      const columnName = columnSettings["column_title"];
      const wrap = Boolean(columnSettings["text_wrapping"]);
      const align = columnSettings["text_align"] ?? "left";
      const variant = getBodyCellVariant(col, columnSettings);
      const sortDirection = getColumnSortDirection(index);

      const id = isPivoted ? `${index}:${col.name}` : col.name;
      return columnHelper.accessor(row => row[index], {
        id,
        header: memo(props => {
          return (
            <HeaderCell name={columnName} align={align} sort={sortDirection} />
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

            if (variant === "minibar") {
              return (
                <MiniBar
                  backgroundColor={backgroundColor}
                  value={value}
                  formatter={columnFormatters[index]}
                  extent={getColumnExtent(cols, rows, index)}
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
                onExpand={() => {
                  const formatter = columnFormatters[index];
                  const formattedValue = formatter(value);
                  handleExpandButtonClick(col.name, formattedValue);
                }}
                variant={variant}
                wrap={wrap}
              />
            );
          },
        ),
        meta: {
          isPivoted,
          column: col,
          datasetIndex: index,
          wrap,
        },
      });
    });

    if (!settings["table.row_index"]) {
      return dataColumns;
    }
    return [indexColumn, ...dataColumns];
  }, [
    cols,
    expandedColumns,
    measuredColumnSizing,
    settings,
    isPivoted,
    getColumnSortDirection,
    data,
    onVisualizationClick,
    columnFormatters,
    question,
    hasMetadataPopovers,
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
          setColumnSizing(
            getColumnSizing(cols, contentWidths, expandedColumns),
          );
        }

        setMeasuredColumnSizing(getColumnSizing(cols, contentWidths));
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
      !savedColumnSizing || Object.values(savedColumnSizing).length === 0;
    measureColumnWidths(shouldUpdateCurrentWidths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    columns,
    columnFormatters,
    columnSizing,
    setColumnSizing,
    measureColumnWidths,
    onResizeColumn,
  };
};

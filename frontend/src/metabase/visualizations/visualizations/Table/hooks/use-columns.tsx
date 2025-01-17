import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Root } from "react-dom/client";
import { useUpdateEffect } from "react-use";

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
import type {
  ComputedVisualizationSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import { isFK, isNumber, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ColumnSettings,
  DatasetColumn,
  DatasetData,
  RowValue,
  RowValues,
} from "metabase-types/api";

import {
  BodyCell,
  type BodyCellProps,
  type BodyCellVariant,
} from "../cell/BodyCell";
import { HeaderCell } from "../cell/HeaderCell";
import { MIN_COLUMN_WIDTH } from "../constants";
import { pickRowsToMeasure } from "../utils";

import type { CellMeasurer } from "./use-cell-measure";

const CELL_BORDERS_WIDTH = 2;

const getBodyCellOptions = (
  column: DatasetColumn,
  settings: ColumnSettings,
): Pick<BodyCellProps, "variant" | "wrap"> => {
  let variant: BodyCellVariant;
  const isPill = isPK(column) || isFK(column);
  if (isPill) {
    variant = "pill";
  } else if (settings["show_mini_bar"]) {
    variant = "minibar";
  } else {
    variant = "text";
  }

  const wrap = !!settings["text_wrapping"];

  return {
    variant,
    wrap,
  };
};

interface UseColumnsProps {
  settings: ComputedVisualizationSettings;
  data: DatasetData;
  onVisualizationClick?: VisualizationProps["onVisualizationClick"];
  measureBodyCellDimensions: CellMeasurer;
  measureHeaderCellDimensions: CellMeasurer;
  isPivoted?: boolean;
}

export const useColumns = ({
  settings,
  onVisualizationClick,
  data,
  measureBodyCellDimensions,
  measureHeaderCellDimensions,
  isPivoted = false,
}: UseColumnsProps) => {
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
  const [columnWidths, setColumnWidths] = useState(savedColumnWidths);

  const _measureColumnWidths = useCallback(() => {
    const widths = cols.map((col, index) => {
      const headerWidth =
        measureHeaderCellDimensions(col.display_name).width +
        CELL_BORDERS_WIDTH;

      const sampleRows = pickRowsToMeasure(rows, index);

      const cellWidths = sampleRows.map(rowIndex => {
        const value = rows[rowIndex][index];
        const formattedValue = columnFormatters[index](value);
        return measureBodyCellDimensions(formattedValue).width;
      });

      return Math.max(headerWidth, ...cellWidths, MIN_COLUMN_WIDTH);
    });

    setColumnWidths(widths);
  }, [
    cols,
    columnFormatters,
    measureBodyCellDimensions,
    measureHeaderCellDimensions,
    rows,
  ]);

  useUpdateEffect(() => {
    if (Array.isArray(settings["table.column_widths"])) {
      setColumnWidths(settings["table.column_widths"]);
    }
  }, [settings["table.column_widths"]]);

  const columns = useMemo(() => {
    return cols.map((col, index) => {
      const align = isNumber(col) ? "right" : "left";
      const columnWidth = columnWidths[index] ?? 0;
      const columnSettings = settings.column?.(col) ?? {};
      const bodyCellOptions = getBodyCellOptions(col, columnSettings);

      return {
        id: index.toString(),
        accessorFn: (row: RowValues) => row[index],
        header: () => {
          const headerClicked = getTableHeaderClickedObject(
            data,
            index,
            isPivoted,
          );
          return (
            <HeaderCell
              name={col.display_name}
              align={align}
              onClick={event => {
                onVisualizationClick?.({
                  ...headerClicked,
                  element: event.currentTarget,
                });
              }}
            />
          );
        },
        cell: (props: { getValue: () => RowValue; row: { index: number } }) => {
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

          return (
            <BodyCell
              value={value}
              align={align}
              formatter={columnFormatters[index]}
              backgroundColor={backgroundColor}
              onClick={event => {
                onVisualizationClick?.({
                  ...clicked,
                  element: event.currentTarget,
                });
              }}
              {...bodyCellOptions}
            />
          );
        },
        column: col,
        datasetIndex: index,
        size: columnWidth,
        wrap: bodyCellOptions.wrap,
        isPivoted,
      };
    });
  }, [
    cols,
    settings,
    columnWidths,
    columnFormatters,
    onVisualizationClick,
    isPivoted,
    data,
  ]);

  const measureRootRef = useRef<HTMLDivElement>();
  const measureRootTree = useRef<Root>();

  const measureColumnWidths = useCallback(() => {
    const { cols, rows } = data;

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
      setColumnWidths(contentWidths);
    };

    const content = (
      <EmotionCacheProvider>
        <ThemeProvider>
          <div style={{ display: "flex" }} ref={onMeasureHeaderRender}>
            {cols.map((column, columnIndex) => {
              const columnSettings = settings.column?.(column) ?? {};
              const bodyCellOptions = getBodyCellOptions(
                column,
                columnSettings,
              );
              return (
                <div className="fake-column" key={"column-" + columnIndex}>
                  <HeaderCell name={column.display_name} />
                  {pickRowsToMeasure(rows, columnIndex).map(rowIndex => (
                    <BodyCell
                      key={rowIndex}
                      value={rows[rowIndex][columnIndex]}
                      formatter={columnFormatters[columnIndex]}
                      {...bodyCellOptions}
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
  }, [columnFormatters, data, settings]);

  useLayoutEffect(() => {
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

    measureColumnWidths();
  }, []);

  return {
    columns,
    columnFormatters,
    columnWidths,
    measureColumnWidths,
  };
};

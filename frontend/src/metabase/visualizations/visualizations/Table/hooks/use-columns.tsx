import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useUpdateEffect } from "react-use";

import { formatValue } from "metabase/lib/formatting";
import { cachedFormatter } from "metabase/visualizations/echarts/cartesian/utils/formatter";
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
}

export const useColumns = ({
  settings,
  onVisualizationClick,
  data,
  measureBodyCellDimensions,
  measureHeaderCellDimensions,
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

  const measureColumnWidths = useCallback(() => {
    const widths = cols.map((col, index) => {
      const headerWidth = measureHeaderCellDimensions(col.display_name).width;

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

  useLayoutEffect(() => {
    measureColumnWidths();
  }, []);

  const columns = useMemo(() => {
    return cols.map((col, index) => {
      const align = isNumber(col) ? "right" : "left";
      const columnSettings = settings.column?.(col) ?? {};
      const columnWidth = columnWidths[index] ?? 0;
      const bodyCellOptions = getBodyCellOptions(col, columnSettings);

      return {
        id: index.toString(),
        accessorFn: (row: RowValues) => row[index],
        header: () => (
          <HeaderCell
            name={col.display_name}
            align={align}
            onClick={event =>
              onVisualizationClick?.({
                column: col,
                element: event.currentTarget,
              })
            }
          />
        ),
        cell: (props: { getValue: () => RowValue; row: { index: number } }) => {
          const value = props.getValue();
          const backgroundColor = settings["table._cell_background_getter"]?.(
            value,
            props.row.index,
            col.name,
          );

          return (
            <BodyCell
              value={value}
              align={align}
              formatter={columnFormatters[index]}
              backgroundColor={backgroundColor}
              onClick={event => {
                onVisualizationClick?.({
                  value,
                  column: col,
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
      };
    });
  }, [cols, settings, columnWidths, columnFormatters, onVisualizationClick]);

  return {
    columns,
    columnFormatters,
    columnWidths,
    measureColumnWidths,
  };
};

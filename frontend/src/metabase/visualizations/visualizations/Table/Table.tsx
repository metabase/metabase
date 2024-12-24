import { ReactNode, useMemo, useRef } from "react";
import DataGrid, {
  type Column,
  type DataGridHandle,
  type RenderCellProps,
  type RenderHeaderCellProps,
} from "react-data-grid";
import _ from "underscore";

import { formatValue } from "metabase/lib/formatting";
import { Box, Flex } from "metabase/ui";
import { cachedFormatter } from "metabase/visualizations/echarts/cartesian/utils/formatter";
import type {
  Formatter,
  TableCellFormatter,
  VisualizationProps,
} from "metabase/visualizations/types";
import { isNumber } from "metabase-lib/v1/types/utils/isa";
import type { RowValue } from "metabase-types/api";

import styles from "./Table.module.css";
import { MiniBarCell } from "./cell/MiniBarCell";
import { TextCell } from "./cell/TextCell";
import { TABLE_DEFINITION } from "./chart-definition";

import "react-data-grid/lib/styles.css";

import { HeaderCell } from "./cell/HeaderCell";
import { AddColumnButton } from "./AddColumnButton";

const ROW_HEIGHT = 36;
const HEADER_ROW_HEIGHT = 36;
const MIN_COLUMN_WIDTH = 50;

export const Table = ({
  data,
  height,
  settings,
  width,
  onVisualizationClick,
  onUpdateVisualizationSettings,
}: VisualizationProps) => {
  const dataGridRef = useRef<DataGridHandle>(null);
  const { rows, cols } = data;
  const columnWidths = settings["table.column_widths"] || [];

  const columnFormatters: TableCellFormatter[] = useMemo(() => {
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

  const handleColumnResize = (idx: number, width: number) => {
    const newColumnWidths = [...columnWidths];
    newColumnWidths[idx] = Math.max(width, MIN_COLUMN_WIDTH);
    onUpdateVisualizationSettings({
      "table.column_widths": newColumnWidths,
    });
  };

  const handleColumnReorder = (sourceIdx: number, targetIdx: number) => {
    const columns = settings["table.columns"] || cols.map(col => ({ ...col }));
    const reorderedColumns = [...columns];
    const [removed] = reorderedColumns.splice(sourceIdx, 1);
    reorderedColumns.splice(targetIdx, 0, removed);

    onUpdateVisualizationSettings({
      "table.columns": reorderedColumns,
    });
  };

  const getCellBackgroundColor = (
    value: unknown,
    rowIndex: number,
    column: any,
  ) => {
    try {
      return settings["table._cell_background_getter"]?.(
        value,
        rowIndex,
        column.name,
      );
    } catch (e) {
      console.error(e);
      return undefined;
    }
  };

  const columns: Column<RowValue[]>[] = useMemo(() => {
    const indexColumn: Column<unknown> = {
      key: `\0_index`,
      name: "#",
      width: "max-content",
      frozen: true,
      draggable: false,
      resizable: false,
      renderCell: props => (
        <TextCell
          textAlign="right"
          value={props.rowIdx}
          formatter={val => String(val)}
          {...props}
        />
      ),
    };

    const valueColumns = cols.map<Column<RowValue[]>>((col, index) => {
      const columnSettings = settings.column?.(col);
      const showMiniBar = columnSettings?.["show_mini_bar"];

      return {
        key: index.toString(),
        name: col.display_name,
        width: columnWidths[index] || "max-content",
        resizable: true,
        draggable: true,
        minWidth: MIN_COLUMN_WIDTH,
        className: isNumber(col) ? styles.rightAligned : undefined,
        renderHeaderCell: (props: RenderHeaderCellProps<RowValue[]>) => {
          return <HeaderCell {...props} />;
        },
        renderCell: (props: RenderCellProps<RowValue[]>) => {
          const { row, rowIdx } = props;
          const formatter = columnFormatters[index];
          const value = row[index];
          const backgroundColor = getCellBackgroundColor(value, rowIdx, col);

          return (
            <TextCell
              {...props}
              value={value}
              formatter={formatter}
              style={{ backgroundColor }}
              onClick={event => {
                if (onVisualizationClick) {
                  onVisualizationClick({
                    value,
                    column: col,
                    element: event.currentTarget,
                  });
                }
              }}
            />
          );
        },
      };
    });

    return [indexColumn, ...valueColumns];
  }, [
    cols,
    settings,
    columnWidths,
    columnFormatters,
    getCellBackgroundColor,
    onVisualizationClick,
  ]);

  const tableWidth = Array.from(
    dataGridRef.current?.element?.querySelector(".rdg-header-row")
      ?.childNodes ?? [],
  ).reduce((acc, el) => el.clientWidth + acc, 0);

  return (
    <Box style={{ height, position: "relative" }}>
      <DataGrid
        enableVirtualization
        ref={dataGridRef}
        className={styles.table}
        columns={columns}
        rows={rows}
        rowHeight={ROW_HEIGHT}
        headerRowHeight={HEADER_ROW_HEIGHT}
        onColumnResize={(idx, width) => handleColumnResize(idx, width)}
        onColumnsReorder={(sourceIdx, targetIdx) =>
          handleColumnReorder(sourceIdx, targetIdx)
        }
      />

      <AddColumnButton
        headerHeight={HEADER_ROW_HEIGHT}
        pageWidth={width}
        tableContentWidth={tableWidth}
        onClick={e =>
          onVisualizationClick({ columnShortcuts: true, element: e.target })
        }
      />
    </Box>
  );
};

Object.assign(Table, TABLE_DEFINITION);

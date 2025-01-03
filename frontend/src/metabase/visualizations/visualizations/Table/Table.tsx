import cx from "classnames";
import { useCallback, useMemo, useRef } from "react";
import DataGrid, {
  type Column,
  type DataGridHandle,
  type RenderHeaderCellProps,
} from "react-data-grid";

import { formatValue } from "metabase/lib/formatting";
import { Box } from "metabase/ui";
import { cachedFormatter } from "metabase/visualizations/echarts/cartesian/utils/formatter";
import type { VisualizationProps } from "metabase/visualizations/types";
import { isFK, isNumber, isPK } from "metabase-lib/v1/types/utils/isa";
import type { RowValue } from "metabase-types/api";

import { AddColumnButton } from "./AddColumnButton";
import styles from "./Table.module.css";
import { HeaderCell } from "./cell/HeaderCell";
import { TextCell } from "./cell/TextCell";
import { TABLE_DEFINITION } from "./chart-definition";

import "react-data-grid/lib/styles.css";

const ROW_HEIGHT = 36;
const HEADER_ROW_HEIGHT = 36;
const MIN_COLUMN_WIDTH = 50;

const INDEX_COLUMN_ID = "\0_index";
const INDEX_COLUMN_WIDTH = 60;

// Table adds an index column at the beginning of the columns array so we need to subtract 1 to get the correct index in the data array
const getDataColumnIndex = (displayIndex: number) => displayIndex - 1;

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

  const columnWidths = useMemo(
    () => settings["table.column_widths"] || [],
    [settings],
  );

  const handleColumnResize = useCallback(
    (idx: number, width: number) => {
      const dataIndex = getDataColumnIndex(idx);
      if (dataIndex < 0) {
        return;
      }

      const newColumnWidths = [...columnWidths];
      newColumnWidths[dataIndex] = Math.max(width, MIN_COLUMN_WIDTH);

      onUpdateVisualizationSettings({
        "table.column_widths": newColumnWidths,
      });
    },
    [columnWidths, onUpdateVisualizationSettings],
  );

  const handleColumnReorder = useCallback(
    (sourceKey: string, targetKey: string) => {
      if (sourceKey === INDEX_COLUMN_ID || targetKey === INDEX_COLUMN_ID) {
        return;
      }

      const sourceIdx = parseInt(sourceKey, 10);
      const targetIdx = parseInt(targetKey, 10);
      const sourceDataIdx = getDataColumnIndex(sourceIdx);
      const targetDataIdx = getDataColumnIndex(targetIdx);

      if (sourceDataIdx < 0 || targetDataIdx < 0) return;

      const columns =
        settings["table.columns"] ||
        cols.map(col => ({ ...col, enabled: true }));

      const reorderedColumns = [...columns];
      const [removed] = reorderedColumns.splice(sourceDataIdx, 1);
      reorderedColumns.splice(targetDataIdx, 0, removed);

      onUpdateVisualizationSettings({
        "table.columns": reorderedColumns,
      });
    },
    [cols, settings, onUpdateVisualizationSettings],
  );

  const handleHeaderClick = useCallback(
    (column: any, element: HTMLElement) => {
      onVisualizationClick?.({
        column,
        element,
      });
    },
    [onVisualizationClick],
  );

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

  const columns = useMemo(() => {
    const indexColumn: Column<RowValue[]> = {
      key: INDEX_COLUMN_ID,
      name: "#",
      width: INDEX_COLUMN_WIDTH,
      frozen: true,
      draggable: false,
      resizable: false,
      renderCell: ({ rowIdx }) => <TextCell value={rowIdx + 1} />,
    };

    const valueColumns = cols.map<Column<RowValue[]>>((col, index) => {
      const isRightAligned = isNumber(col);
      const isPrimaryKey = isPK(col);
      const isForeignKey = isFK(col);

      return {
        key: index.toString(),
        name: col.display_name,
        width: columnWidths[index] || "max-content",
        resizable: true,
        draggable: true,
        minWidth: MIN_COLUMN_WIDTH,
        className: cx(styles.column, {
          [styles.rightAligned]: isRightAligned,
        }),
        renderHeaderCell: (props: RenderHeaderCellProps<RowValue[]>) => (
          <HeaderCell
            {...props}
            textAlign={isRightAligned ? "right" : "left"}
            onHeaderClick={event => handleHeaderClick(col, event.currentTarget)}
          >
            {props.column.name}
          </HeaderCell>
        ),
        renderCell: ({ row, rowIdx }) => {
          const value = row[index];
          const backgroundColor = settings["table._cell_background_getter"]?.(
            value,
            rowIdx,
            col.name,
          );

          return (
            <TextCell
              value={value}
              formatter={columnFormatters[index]}
              textAlign={isRightAligned ? "right" : "left"}
              style={{ backgroundColor }}
              isPK={isPrimaryKey}
              isFK={isForeignKey}
              onClick={event => {
                onVisualizationClick?.({
                  value,
                  column: col,
                  element: event.currentTarget,
                });
              }}
            >
              {columnFormatters[index](value)}
            </TextCell>
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
    onVisualizationClick,
    handleHeaderClick,
  ]);

  return (
    <Box style={{ height, position: "relative" }}>
      <DataGrid
        ref={dataGridRef}
        className={styles.table}
        columns={columns}
        rows={rows}
        rowHeight={ROW_HEIGHT}
        headerRowHeight={HEADER_ROW_HEIGHT}
        onColumnResize={handleColumnResize}
        onColumnsReorder={handleColumnReorder}
        enableVirtualization
        defaultColumnOptions={{
          sortable: true,
          resizable: true,
        }}
      />
      <AddColumnButton
        headerHeight={HEADER_ROW_HEIGHT}
        pageWidth={width}
        tableContentWidth={width}
        onClick={e =>
          onVisualizationClick?.({
            columnShortcuts: true,
            element: e.currentTarget,
          })
        }
      />
    </Box>
  );
};

Object.assign(Table, TABLE_DEFINITION);

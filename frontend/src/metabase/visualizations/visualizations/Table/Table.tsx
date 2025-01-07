import { useCallback, useMemo, useRef } from "react";
import DataGrid, { type Column, type DataGridHandle } from "react-data-grid";
import _ from "underscore";

import { formatValue } from "metabase/lib/formatting";
import { connect } from "metabase/lib/redux";
import {
  getIsShowingRawTable,
  getQueryBuilderMode,
  getUiControls,
} from "metabase/query_builder/selectors";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { Box } from "metabase/ui";
import { cachedFormatter } from "metabase/visualizations/echarts/cartesian/utils/formatter";
import type { VisualizationProps } from "metabase/visualizations/types";
import { isFK, isNumber, isPK } from "metabase-lib/v1/types/utils/isa";
import type { RowValue } from "metabase-types/api";

import "react-data-grid/lib/styles.css";
import { AddColumnButton } from "./AddColumnButton";
import styles from "./Table.module.css";
import { BodyCell } from "./cell/BodyCell";
import { HeaderCell } from "./cell/HeaderCell";
import { IndexCell } from "./cell/IndexCell";
import { IndexHeaderCell } from "./cell/IndexHeaderCell";
import { useMeasureCells } from "./hooks/use-measure-cells";
import { useObjectDetail } from "./hooks/use-object-detail";

const ROW_HEIGHT = 36;
const HEADER_ROW_HEIGHT = 36;
const MIN_COLUMN_WIDTH = 50;

const INDEX_COLUMN_ID = "\0_index";

// Table adds an index column at the beginning of the columns array so we need to subtract 1 to get the correct index in the data array
const toDataColumnIndex = (displayIndex: number) => displayIndex - 1;

export const _Table = ({
  data,
  height,
  settings,
  width,
  onVisualizationClick,
  onUpdateVisualizationSettings,
}: VisualizationProps) => {
  const onOpenObjectDetail = useObjectDetail(data);
  const dataGridRef = useRef<DataGridHandle>(null);
  const { rows, cols } = data;

  const columnWidthsSetting = useMemo(
    () => settings["table.column_widths"] || [],
    [settings],
  );

  const handleColumnResize = useCallback(
    (idx: number, width: number) => {
      const dataIndex = toDataColumnIndex(idx);
      if (dataIndex < 0) {
        return;
      }

      const newColumnWidths = [...columnWidthsSetting];
      newColumnWidths[dataIndex] = width;

      onUpdateVisualizationSettings({
        "table.column_widths": newColumnWidths,
      });
    },
    [columnWidthsSetting, onUpdateVisualizationSettings],
  );

  const handleColumnReorder = useCallback(
    (sourceKey: string, targetKey: string) => {
      if (sourceKey === INDEX_COLUMN_ID || targetKey === INDEX_COLUMN_ID) {
        return;
      }

      const sourceIdx = parseInt(sourceKey, 10);
      const targetIdx = parseInt(targetKey, 10);
      const sourceDataIdx = toDataColumnIndex(sourceIdx);
      const targetDataIdx = toDataColumnIndex(targetIdx);

      if (sourceDataIdx < 0 || targetDataIdx < 0) {
        return;
      }

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

  const renderBodyCell = useCallback(
    ({ row, column }: { row: RowValue[]; column: Column<RowValue[]> }) => {
      const columnIndex = parseInt(column.key as string, 10);
      const value = row[columnIndex];
      const col = cols[columnIndex];
      const align = isNumber(col) ? "right" : "left";
      const isPill = isPK(col) || isFK(col);
      const backgroundColor = settings["table._cell_background_getter"]?.(
        value,
        columnIndex,
        col.name,
      );

      return (
        <BodyCell
          variant={isPill ? "pill" : "text"}
          value={value}
          formatter={columnFormatters[columnIndex]}
          align={align}
          backgroundColor={backgroundColor}
          onClick={event => {
            onVisualizationClick?.({
              value,
              column: col,
              element: event.currentTarget,
            });
          }}
        />
      );
    },
    [cols, columnFormatters, onVisualizationClick, settings],
  );

  const renderHeaderCell = useCallback(
    ({ column }: { column: Column<RowValue[]> }) => {
      const columnIndex = parseInt(column.key as string, 10);
      const col = cols[columnIndex];
      const align = isNumber(col) ? "right" : "left";

      return (
        <HeaderCell
          name={col.display_name}
          align={align}
          onClick={event => handleHeaderClick(col, event.currentTarget)}
        />
      );
    },
    [cols, handleHeaderClick],
  );

  const { columnWidths } = useMeasureCells({
    columns: cols.map((col, index) => ({
      key: index.toString(),
      name: col.display_name,
    })),
    rows,
    renderCell: renderBodyCell,
    renderHeaderCell,
  });

  const columns = useMemo(() => {
    const indexColumn: Column<RowValue[]> = {
      key: INDEX_COLUMN_ID,
      name: "#",
      frozen: true,
      draggable: false,
      resizable: false,
      width: "max-content",
      renderHeaderCell: () => <IndexHeaderCell />,
      renderCell: ({ rowIdx }) => (
        <IndexCell
          rowNumber={rowIdx + 1}
          onClick={() => onOpenObjectDetail(rowIdx)}
        />
      ),
    };

    const valueColumns = cols.map<Column<RowValue[]>>((col, index) => {
      return {
        key: index.toString(),
        name: col.display_name,
        width:
          columnWidthsSetting[index] || columnWidths[index] || "max-content",
        resizable: true,
        draggable: true,
        minWidth: MIN_COLUMN_WIDTH,
        renderHeaderCell,
        renderCell: renderBodyCell,
      };
    });

    return [indexColumn, ...valueColumns];
  }, [
    cols,
    onOpenObjectDetail,
    columnWidths,
    columnWidthsSetting,
    renderHeaderCell,
    renderBodyCell,
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

const mapStateToProps = (state: any) => ({
  queryBuilderMode: getQueryBuilderMode(state),
  isEmbeddingSdk: getIsEmbeddingSdk(state),
  scrollToLastColumn: getUiControls(state).scrollToLastColumn,
  isRawTable: getIsShowingRawTable(state),
});

export const Table = connect(mapStateToProps, null)(_Table);

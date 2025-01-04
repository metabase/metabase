import cx from "classnames";
import { useCallback, useMemo, useRef } from "react";
import DataGrid, {
  type Column,
  type DataGridHandle,
  type RenderHeaderCellProps,
} from "react-data-grid";
import _ from "underscore";

import { formatValue } from "metabase/lib/formatting";
import { connect } from "metabase/lib/redux";
import { zoomInRow } from "metabase/query_builder/actions";
import {
  getIsShowingRawTable,
  getQueryBuilderMode,
  getRowIndexToPKMap,
  getUiControls,
} from "metabase/query_builder/selectors";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { Box } from "metabase/ui";
import { cachedFormatter } from "metabase/visualizations/echarts/cartesian/utils/formatter";
import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";
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
import { TABLE_DEFINITION } from "./chart-definition";

const ROW_HEIGHT = 36;
const HEADER_ROW_HEIGHT = 36;
const MIN_COLUMN_WIDTH = 50;
const MAX_COLUMN_WIDTH = 300;

const INDEX_COLUMN_ID = "\0_index";

// Table adds an index column at the beginning of the columns array so we need to subtract 1 to get the correct index in the data array
const toDataColumnIndex = (displayIndex: number) => displayIndex - 1;
const toDisplayColumnIndex = (dataIndex: number) => dataIndex + 1;

export const _Table = ({
  data,
  height,
  settings,
  width,
  onZoomRow,
  rowIndexToPkMap,
  onVisualizationClick,
  onUpdateVisualizationSettings,
}: VisualizationProps) => {
  const dataGridRef = useRef<DataGridHandle>(null);
  const { rows, cols } = data;

  const primaryKeyColumn: ColumnDescriptor | null = useMemo(() => {
    const primaryKeyColumns = data.cols.filter(isPK);

    // As of now, we support object detail drill on datasets with single column PK
    if (primaryKeyColumns.length !== 1) {
      return null;
    }
    const primaryKeyColumn = primaryKeyColumns[0];

    return {
      column: primaryKeyColumn,
      index: data.cols.indexOf(primaryKeyColumn),
    };
  }, [data.cols]);

  const handleRowZoom = useCallback(
    (rowIndex: number) => {
      let objectId;

      if (primaryKeyColumn) {
        objectId = rows[rowIndex][primaryKeyColumn.index];
      } else {
        objectId = rowIndexToPkMap[rowIndex] ?? rowIndex;
      }

      onZoomRow?.(objectId);
    },
    [onZoomRow, primaryKeyColumn, rowIndexToPkMap, rows],
  );

  const columnWidths = useMemo(
    () => settings["table.column_widths"] || [],
    [settings],
  );

  const handleColumnResize = useCallback(
    (idx: number, width: number) => {
      const dataIndex = toDataColumnIndex(idx);
      if (dataIndex < 0) {
        return;
      }

      const newColumnWidths = [...columnWidths];
      newColumnWidths[dataIndex] = width;

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
          onClick={() => {
            console.log(">>>here");
            handleRowZoom(rowIdx);
          }}
        />
      ),
    };

    const valueColumns = cols.map<Column<RowValue[]>>((col, index) => {
      const align = isNumber(col) ? "right" : "left";
      const isPill = isPK(col) || isFK(col);

      return {
        key: index.toString(),
        name: col.display_name,
        width: columnWidths[index] || "max-content",
        resizable: true,
        draggable: true,
        minWidth: MIN_COLUMN_WIDTH,
        renderHeaderCell: (props: RenderHeaderCellProps<RowValue[]>) => (
          <HeaderCell
            name={props.column.name}
            align={align}
            onClick={event => handleHeaderClick(col, event.currentTarget)}
          />
        ),
        renderCell: ({ row, rowIdx }) => {
          const value = row[index];
          const backgroundColor = settings["table._cell_background_getter"]?.(
            value,
            rowIdx,
            col.name,
          );

          return (
            <BodyCell
              variant={isPill ? "pill" : "text"}
              value={value}
              formatter={columnFormatters[index]}
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
      };
    });

    return [indexColumn, ...valueColumns];
  }, [
    cols,
    handleRowZoom,
    columnWidths,
    handleHeaderClick,
    settings,
    columnFormatters,
    onVisualizationClick,
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

const mapStateToProps = state => ({
  queryBuilderMode: getQueryBuilderMode(state),
  rowIndexToPkMap: getRowIndexToPKMap(state),
  isEmbeddingSdk: getIsEmbeddingSdk(state),
  scrollToLastColumn: getUiControls(state).scrollToLastColumn,
  isRawTable: getIsShowingRawTable(state),
});

const mapDispatchToProps = dispatch => ({
  onZoomRow: objectId => dispatch(zoomInRow({ objectId })),
});

export const Table = connect(mapStateToProps, mapDispatchToProps)(_Table);

Object.assign(Table, TABLE_DEFINITION);

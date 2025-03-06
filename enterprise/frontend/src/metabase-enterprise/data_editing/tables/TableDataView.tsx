import type { ColumnSizingState } from "@tanstack/react-table";
import type React from "react";
import { useCallback, useMemo } from "react";

import {
  type ColumnOptions,
  DataGrid,
  type RowIdColumnOptions,
  useDataGridInstance,
} from "metabase/data-grid";
import { formatValue } from "metabase/lib/formatting/value";
import { Box, Text } from "metabase/ui";
import type { Dataset, RowValue, RowValues } from "metabase-types/api";

import { EditingBodyCellConditional } from "./EditingBodyCell";
import type { UpdatedRowCellsHandlerParams } from "./types";
import { useTableEditing } from "./use-table-editing";
import S from "./TableDataView.module.css";

type TableDataViewProps = {
  data: Dataset;
  onCellValueUpdate: (params: UpdatedRowCellsHandlerParams) => void;
};

export const TableDataView = ({
  data,
  onCellValueUpdate,
}: TableDataViewProps) => {
  const { cols, rows } = data.data;

  const { editingCellId, onCellClickToEdit, onCellEditCancel } =
    useTableEditing();

  const columnOrder = useMemo(() => cols.map(({ name }) => name), [cols]);

  const columnSizingMap = useMemo(() => {
    return cols.reduce((acc: ColumnSizingState, column) => {
      acc[column.name] = 100;
      return acc;
    }, {});
  }, [cols]);

  const columnsOptions: ColumnOptions<RowValues, RowValue>[] = useMemo(() => {
    return cols.map((column, columnIndex) => {
      const options: ColumnOptions<RowValues, RowValue> = {
        id: column.name,
        name: column.display_name,
        accessorFn: (row: RowValues) => row[columnIndex],
        formatter: value => formatValue(value, { column }),
        wrap: false,
        editingCell: cellContext => (
          <EditingBodyCellConditional
            cellContext={cellContext}
            column={column}
            onCellValueUpdate={onCellValueUpdate}
            onCellEditCancel={onCellEditCancel}
          />
        ),
        getIsCellEditing: (cellId: string) => editingCellId === cellId,
      };

      options.header = function EditingHeader(_props) {
        return (
          <Box className={S.headerCellContainer}>
            <Text style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              {column.display_name}
            </Text>
          </Box>
        );
      };

      return options;
    });
  }, [cols, editingCellId, onCellEditCancel, onCellValueUpdate]);

  const rowId: RowIdColumnOptions = useMemo(
    () => ({
      variant: "expandButton",
    }),
    [],
  );

  const tableProps = useDataGridInstance({
    data: rows,
    rowId,
    columnOrder,
    columnSizingMap,
    columnsOptions,
    defaultRowHeight: 32,
  });

  const handleCellClick = useCallback(
    (
      e: React.MouseEvent<HTMLDivElement>,
      {
        cellId,
      }: {
        cellId: string;
      },
    ) => {
      // Prevents event from bubbling up inside editing cell
      // Otherwise requires special handling in EditingBodyCell
      if (editingCellId !== cellId) {
        onCellClickToEdit(cellId);
      }
    },
    [onCellClickToEdit, editingCellId],
  );

  return (
    <DataGrid
      {...tableProps}
      classNames={{
        tableGrid: S.tableGrid,
        headerCell: S.tableHeaderCell,
        bodyCell: S.tableBodyCell,
        row: S.tableRow,
      }}
      styles={{
        // Overrides HEADER_HEIGHT JS const
        row: { height: "32px" },
      }}
      onBodyCellClick={handleCellClick}
    />
  );
};

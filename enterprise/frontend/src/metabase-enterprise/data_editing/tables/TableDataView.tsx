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
import { EditingBodyCell } from "metabase-enterprise/data_editing/tables/EditingBodyCell";
import { useTableEditing } from "metabase-enterprise/data_editing/tables/use-table-editing";
import type { Dataset, RowValue, RowValues } from "metabase-types/api";

import type { RowCellsWithPkValue } from "./types";

type TableDataViewProps = {
  data: Dataset;
  onCellValueUpdate: (params: RowCellsWithPkValue) => void;
};

export const TableDataView = ({
  data,
  onCellValueUpdate,
}: TableDataViewProps) => {
  const { cols, rows } = data.data;

  const { editingCellsMap, onCellClickToEdit, onCellEditCancel } =
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
          <EditingBodyCell
            cellContext={cellContext}
            columns={cols}
            onCellValueUpdate={onCellValueUpdate}
            onCellEditCancel={onCellEditCancel}
          />
        ),
        getIsCellEditing: (cellId: string) => editingCellsMap[cellId],
      };

      return options;
    });
  }, [cols, editingCellsMap, onCellEditCancel, onCellValueUpdate]);

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
  });

  const handleCellClick = useCallback(
    (
      e: React.MouseEvent<HTMLDivElement>,
      rowIndex: number,
      columnName: string,
      cellId: string,
    ) => {
      // const cellId = getGridCellId(rowIndex, columnName);

      onCellClickToEdit(cellId);
    },
    [onCellClickToEdit],
  );

  return <DataGrid {...tableProps} onBodyCellClick={handleCellClick} />;
};

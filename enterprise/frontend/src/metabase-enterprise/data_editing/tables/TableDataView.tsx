import type { ColumnSizingState } from "@tanstack/react-table";
import { useMemo } from "react";

import {
  type ColumnOptions,
  DataGrid,
  type RowIdColumnOptions,
  useDataGridInstance,
} from "metabase/data-grid";
import { formatValue } from "metabase/lib/formatting/value";
import type { Dataset, RowValue, RowValues } from "metabase-types/api";

import { TableDataViewEditingCell } from "./TableDataViewEditingCell";
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

  const columnOrder = useMemo(() => cols.map(({ name }) => name), [cols]);

  const columnSizingMap = useMemo(() => {
    return cols.reduce((acc: ColumnSizingState, column) => {
      acc[column.name] = 100;
      return acc;
    }, {});
  }, [cols]);

  const columnsOptions: ColumnOptions<RowValues, RowValue>[] = useMemo(() => {
    return cols.map((column, columnIndex) => {
      return {
        id: column.name,
        name: column.display_name,
        accessorFn: (row: RowValues) => row[columnIndex],
        formatter: value => formatValue(value, { column }),
        wrap: false,
        cell: props => (
          <TableDataViewEditingCell
            datasetColumn={column}
            datasetColumnIndex={columnIndex}
            onCellValueUpdate={onCellValueUpdate}
            {...props}
          />
        ),
      };
    });
  }, [cols, onCellValueUpdate]);

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

  return <DataGrid {...tableProps} />;
};

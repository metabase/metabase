import type { ColumnSizingState } from "@tanstack/react-table";
import { useMemo } from "react";

import {
  type ColumnOptions,
  DataGrid,
  useDataGridInstance,
} from "metabase/data-grid";
import type { Dataset, RowValue, RowValues } from "metabase-types/api";

export const TableDataView = ({ data }: { data: Dataset }) => {
  const { cols, rows } = data.data;

  const columnOrder = useMemo(() => cols.map(({ name }) => name), [cols]);

  const columnSizingMap = useMemo(() => {
    return cols.reduce((acc: ColumnSizingState, column) => {
      acc[column.name] = 100;
      return acc;
    }, {});
  }, [cols]);

  const columnsOptions: ColumnOptions<RowValues, RowValue>[] = useMemo(() => {
    return cols.map((col, columnIndex) => {
      const columnName = col.display_name;

      const options: ColumnOptions<RowValues, RowValue> = {
        id: col.name,
        name: columnName,
        accessorFn: (row: RowValues) => row[columnIndex],
        wrap: false,
        cellVariant: col.name === "ID" ? "pill" : undefined,
      };

      return options;
    });
  }, [cols]);

  const tableProps = useDataGridInstance({
    data: rows,
    rowId: undefined,
    columnOrder,
    columnSizingMap,
    columnsOptions,
  });

  return <DataGrid {...tableProps} />;
};

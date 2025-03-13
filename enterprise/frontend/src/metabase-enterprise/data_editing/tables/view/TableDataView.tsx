import type { ColumnSizingState } from "@tanstack/react-table";
import { useMemo } from "react";

import {
  type ColumnOptions,
  DataGrid,
  useDataGridInstance,
} from "metabase/data-grid";
import { formatValue } from "metabase/lib/formatting/value";
import type { Dataset, RowValue, RowValues } from "metabase-types/api";

import S from "./BrowseTableData.module.css";

type TableDataViewProps = {
  data: Dataset;
};

export const TableDataView = ({ data }: TableDataViewProps) => {
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
      const options: ColumnOptions<RowValues, RowValue> = {
        id: column.name,
        name: column.display_name,
        accessorFn: (row: RowValues) => row[columnIndex],
        formatter: value => formatValue(value, { column }),
        wrap: false,
      };

      return options;
    });
  }, [cols]);

  const tableProps = useDataGridInstance({
    data: rows,
    columnOrder,
    columnSizingMap,
    columnsOptions,
  });

  return (
    <DataGrid
      classNames={{
        root: S.gridRoot,
      }}
      {...tableProps}
    />
  );
};

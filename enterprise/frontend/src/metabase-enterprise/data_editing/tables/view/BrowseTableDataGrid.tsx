import { useMemo } from "react";

import {
  type ColumnOptions,
  DataGrid,
  useDataGridInstance,
} from "metabase/data-grid";
import { formatValue } from "metabase/lib/formatting/value";
import type { Dataset, RowValue, RowValues } from "metabase-types/api";

import S from "./BrowseTableData.module.css";

type BrowseTableDataGridProps = {
  data: Dataset;
};

export const BrowseTableDataGrid = ({ data }: BrowseTableDataGridProps) => {
  const { cols, rows } = data.data;

  const columnOrder = useMemo(() => cols.map(({ name }) => name), [cols]);

  const columnSizingMap = useMemo(() => ({}), []);

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

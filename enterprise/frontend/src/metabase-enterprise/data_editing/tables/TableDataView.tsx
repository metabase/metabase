import type { ColumnSizingState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import {
  type ColumnOptions,
  DataGrid,
  type RowIdColumnOptions,
  useDataGridInstance,
} from "metabase/data-grid";
import { useTableEditing } from "metabase-enterprise/data_editing/tables/use-table-editing";
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
      };

      return options;
    });
  }, [cols]);

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

  const { handleCellClickToEdit } = useTableEditing();

  const handleBodyCellClick = useCallback(
    (
      _: React.MouseEvent<HTMLDivElement>,
      rowIndex: number,
      columnId: string,
      value: any,
    ) => {
      // eslint-disable-next-line no-console
      // console.log(`Clicked cell at row ${rowIndex}, column ${columnId}`);
      const column = cols.find(({ name }) => name === columnId); // TODO: refactor to a common id getter
      const row = rows[rowIndex];
      console.log("Clicked cell", { row, column, value });

      // handleCellClickToEdit(clicked, e.currentTarget, cellProps);
    },
    [cols, rows],
  );

  return <DataGrid {...tableProps} onBodyCellClick={handleBodyCellClick} />;
};

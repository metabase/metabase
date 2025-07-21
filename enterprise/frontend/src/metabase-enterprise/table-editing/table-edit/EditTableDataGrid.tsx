import { useMemo } from "react";

import {
  DataGrid,
  type RowIdColumnOptions,
  useDataGridInstance,
} from "metabase/data-grid";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

import type { DescribeActionFormResponse } from "../api/types";

import S from "./EditTableDataGrid.module.css";
import { useEditDataDridColumnOptions } from "./use-edit-datagrid-column-options";
import type { TableDataGetColumnSortDirection } from "./use-edit-table-data";

type EditTableDataGridProps = {
  data: DatasetData;
  onRowExpandClick: (rowIndex: number) => void;
  updateFormDescription?: DescribeActionFormResponse;
  getColumnSortDirection?: TableDataGetColumnSortDirection;
  onColumnSort?: (field: DatasetColumn) => void;
};

export const EditTableDataGrid = ({
  data,
  onRowExpandClick,
  getColumnSortDirection,
  onColumnSort,
}: EditTableDataGridProps) => {
  const { cols, rows } = data;

  const columnsOptions = useEditDataDridColumnOptions({
    cols,
    getColumnSortDirection,
    onColumnSort,
  });

  const rowIdColumnOptions: RowIdColumnOptions = useMemo(
    () => ({
      variant: "expandButton",
      onRowExpandClick,
    }),
    [onRowExpandClick],
  );

  const tableProps = useDataGridInstance({
    data: rows,
    rowId: rowIdColumnOptions,
    columnsOptions,
  });

  const stylingProps = useMemo(
    () => ({
      classNames: {
        headerContainer: S.tableHeaderContainer,
        headerCell: S.tableHeaderCell,
        bodyContainer: S.tableBodyContainer,
        bodyCell: S.tableBodyCell,
        row: S.tableRow,
        root: S.tableRoot,
      },

      // Overrides theme constants and default bg
      bodyCell: {
        backgroundColor: undefined,
      },
      cell: {
        backgroundColor: "",
      },
    }),
    [],
  );

  return <DataGrid {...tableProps} {...stylingProps} />;
};

import { useCallback, useMemo } from "react";

import {
  DataGrid,
  type RowIdColumnOptions,
  useDataGridInstance,
} from "metabase/data-grid";
import { ROW_ID_COLUMN_ID } from "metabase/data-grid/constants";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

import type { DescribeActionFormResponse } from "../api/types";

import S from "./EditTableDataGrid.module.css";
import { useEditDataDridColumnOptions } from "./use-edit-datagrid-column-options";
import type { TableDataGetColumnSortDirection } from "./use-edit-table-data";
import { useTableEditingCell } from "./use-table-editing-cell";

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

  const { handleSelectEditingCell } = useTableEditingCell({
    data,
  });

  const columnsOptions = useEditDataDridColumnOptions({
    cols,
    getColumnSortDirection,
    onColumnSort,
  });

  const rowIdColumnOptions: RowIdColumnOptions = useMemo(
    () => ({
      variant: "expandButton",
    }),
    [],
  );

  const handleBodyCellClick = useCallback(
    (
      _event: React.MouseEvent<HTMLDivElement>,
      rowIndex: number,
      columnId: string,
    ) => {
      if (columnId === ROW_ID_COLUMN_ID) {
        onRowExpandClick(rowIndex);
        return;
      }

      handleSelectEditingCell(rowIndex, columnId);
    },
    [onRowExpandClick, handleSelectEditingCell],
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

  return (
    <DataGrid
      onBodyCellClick={handleBodyCellClick}
      {...tableProps}
      {...stylingProps}
    />
  );
};

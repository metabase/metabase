import type React from "react";
import { useCallback, useMemo } from "react";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import {
  type ColumnOptions,
  DataGrid,
  type RowIdColumnOptions,
  useDataGridInstance,
} from "metabase/data-grid";
import { formatValue } from "metabase/lib/formatting/value";
import { Box } from "metabase/ui";
import { extractRemappedColumns } from "metabase/visualizations";
import type {
  DatasetColumn,
  DatasetData,
  RowValue,
  RowValues,
} from "metabase-types/api";

import { canEditColumn } from "../../helpers";
import type { UpdatedRowCellsHandlerParams } from "../types";

import S from "./EditTableData.module.css";
import { EditingBodyCellWrapper } from "./EditingBodyCell";
import { useTableEditing } from "./use-table-editing";

type EditTableDataGridProps = {
  data: DatasetData;
  onCellValueUpdate: (params: UpdatedRowCellsHandlerParams) => void;
  onRowExpandClick: (rowIndex: number) => void;
};

export const EditTableDataGrid = ({
  data,
  onCellValueUpdate,
  onRowExpandClick,
}: EditTableDataGridProps) => {
  const { cols, rows } = useMemo(() => extractRemappedColumns(data), [data]);

  const columnIdMap = useMemo(
    () =>
      cols.reduce(
        (acc, col) => ({ ...acc, [col.name]: col }),
        {} as Record<string, DatasetColumn>,
      ),
    [cols],
  );

  const { editingCellId, onCellClickToEdit, onCellEditCancel } =
    useTableEditing();

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
        header: function EditingHeader() {
          return (
            <Box className={S.headerCellContainer}>
              <Ellipsified>{column.display_name}</Ellipsified>
            </Box>
          );
        },
        editingCell: cellContext => (
          <EditingBodyCellWrapper
            cellContext={cellContext}
            column={column}
            onCellValueUpdate={onCellValueUpdate}
            onCellEditCancel={onCellEditCancel}
          />
        ),
        getIsCellEditing: (cellId: string) => editingCellId === cellId,
      };

      return options;
    });
  }, [cols, editingCellId, onCellEditCancel, onCellValueUpdate]);

  const rowId: RowIdColumnOptions = useMemo(
    () => ({
      variant: "expandButton",
      onRowExpandClick,
    }),
    [onRowExpandClick],
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
      {
        cellId,
        columnId,
      }: {
        cellId: string;
        columnId: string;
      },
    ) => {
      const column = columnIdMap[columnId];
      // Disables editing for some columns, such as primary keys
      if (column && !canEditColumn(column)) {
        return;
      }

      // Prevents event from bubbling up inside editing cell
      // Otherwise requires special handling in EditingBodyCell
      if (editingCellId !== cellId) {
        onCellClickToEdit(cellId);
      }
    },
    [onCellClickToEdit, editingCellId, columnIdMap],
  );

  return (
    <DataGrid
      {...tableProps}
      classNames={{
        headerContainer: S.tableHeaderContainer,
        headerCell: S.tableHeaderCell,
        bodyContainer: S.tableBodyContainer,
        bodyCell: S.tableBodyCell,
        row: S.tableRow,
      }}
      styles={{
        // Overrides theme constants and default white bg
        bodyCell: {
          backgroundColor: undefined,
        },
      }}
      theme={{ cell: { backgroundColor: "" } }}
      onBodyCellClick={handleCellClick}
    />
  );
};

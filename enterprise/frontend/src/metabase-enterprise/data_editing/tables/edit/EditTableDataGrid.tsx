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
import type { Dataset, RowValue, RowValues } from "metabase-types/api";

import type { UpdatedRowCellsHandlerParams } from "../types";

import S from "./EditTableData.module.css";
import { EditingBodyCellConditional } from "./EditingBodyCell";
import { useTableEditing } from "./use-table-editing";

type EditTableDataGridProps = {
  data: Dataset;
  onCellValueUpdate: (params: UpdatedRowCellsHandlerParams) => void;
};

const TABLE_DATA_VIEW_HEADER_HEIGHT = 32;

export const EditTableDataGrid = ({
  data,
  onCellValueUpdate,
}: EditTableDataGridProps) => {
  const { cols, rows } = useMemo(
    () => extractRemappedColumns(data.data),
    [data.data],
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
          <EditingBodyCellConditional
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
    }),
    [],
  );

  const tableProps = useDataGridInstance({
    data: rows,
    rowId,
    columnOrder,
    columnSizingMap,
    columnsOptions,
    defaultRowHeight: TABLE_DATA_VIEW_HEADER_HEIGHT,
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
        headerContainer: S.tableHeaderContainer,
        headerCell: S.tableHeaderCell,
        bodyContainer: S.tableBodyContainer,
        bodyCell: S.tableBodyCell,
        row: S.tableRow,
      }}
      styles={{
        // Overrides HEADER_HEIGHT JS const
        row: { height: TABLE_DATA_VIEW_HEADER_HEIGHT },
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

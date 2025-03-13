import type { ColumnSizingState } from "@tanstack/react-table";
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
import type { Dataset, RowValue, RowValues } from "metabase-types/api";

import type { UpdatedRowCellsHandlerParams } from "../types";

import { EditingBodyCellConditional } from "./EditingBodyCell";
import S from "./TableDataView.module.css";
import { useTableEditing } from "./use-table-editing";

type TableDataViewProps = {
  data: Dataset;
  onCellValueUpdate: (params: UpdatedRowCellsHandlerParams) => void;
};

const TABLE_DATA_VIEW_HEADER_HEIGHT = 32;

export const TableDataView = ({
  data,
  onCellValueUpdate,
}: TableDataViewProps) => {
  const { cols, rows } = data.data;

  const { editingCellId, onCellClickToEdit, onCellEditCancel } =
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
        headerCell: S.tableHeaderCell,
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
      onBodyCellClick={handleCellClick}
    />
  );
};

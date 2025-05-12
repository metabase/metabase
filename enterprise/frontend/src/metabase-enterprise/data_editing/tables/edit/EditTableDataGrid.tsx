import type { Row } from "@tanstack/react-table";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import {
  BaseCell,
  type ColumnOptions,
  DataGrid,
  type RowIdColumnOptions,
  useDataGridInstance,
} from "metabase/data-grid";
import { ROW_ID_COLUMN_ID } from "metabase/data-grid/constants";
import { formatValue } from "metabase/lib/formatting/value";
import { Box, Checkbox, Flex, Icon } from "metabase/ui";
import type { OrderByDirection } from "metabase-lib";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  DatasetData,
  FieldWithMetadata,
  RowValue,
  RowValues,
  WritebackAction,
} from "metabase-types/api";

import { canEditField } from "../../helpers";
import type { RowPkValue, UpdateCellValueHandlerParams } from "../types";

import S from "./EditTableData.module.css";
import { EditingBodyCellWrapper } from "./EditingBodyCell";
import type { EditableTableColumnConfig } from "./use-editable-column-config";
import { useTableEditing } from "./use-table-editing";
import { getCellUniqKey } from "./utils";

const ROW_SELECT_COLUMN_ID = "\0_ROW_SELECT";

type EditTableDataGridProps = {
  data: DatasetData;
  fieldMetadataMap: Record<FieldWithMetadata["name"], FieldWithMetadata>;
  onCellValueUpdate: (params: UpdateCellValueHandlerParams) => void;
  onRowExpandClick: (rowIndex: number) => void;
  columnsConfig?: EditableTableColumnConfig;
  getColumnSortDirection?: (
    column: DatasetColumn,
  ) => OrderByDirection | undefined;
  cellsWithFailedUpdatesMap?: Record<RowPkValue, true>;
  rowActions?: WritebackAction[];
  onActionRun?: (action: WritebackAction, row: Row<RowValues>) => void;
  isRowSelectionEnabled?: boolean;
  onRowSelectionChange?: (selectedRowIndices: number[]) => void;
};

export const EditTableDataGrid = ({
  data,
  fieldMetadataMap,
  onCellValueUpdate,
  onRowExpandClick,
  columnsConfig,
  getColumnSortDirection,
  cellsWithFailedUpdatesMap,
  rowActions,
  onActionRun,
  isRowSelectionEnabled,
  onRowSelectionChange,
}: EditTableDataGridProps) => {
  const { cols, rows } = data;

  const { editingCellId, onCellClickToEdit, onCellEditCancel } =
    useTableEditing();

  const columnOrder = useMemo(
    () =>
      columnsConfig
        ? [ROW_SELECT_COLUMN_ID, ...columnsConfig.columnOrder]
        : [ROW_SELECT_COLUMN_ID, ...cols.map(({ name }) => name)],
    [cols, columnsConfig],
  );

  const columnVisibility = useMemo(
    () => (columnsConfig ? columnsConfig.columnVisibilityMap : undefined),
    [columnsConfig],
  );

  const columnSizingMap = useMemo(() => ({}), []);

  const columnsOptions: ColumnOptions<RowValues, RowValue>[] = useMemo(() => {
    const pkColumnIndex = cols.findIndex(isPK);

    return cols.map((column, columnIndex) => {
      const isEditableColumn =
        !columnsConfig || !columnsConfig.isColumnReadonly(column.name);

      const sortDirection = getColumnSortDirection?.(column);

      const options: ColumnOptions<RowValues, RowValue> = {
        id: column.name,
        name: column.display_name,
        accessorFn: (row: RowValues) => row[columnIndex],
        formatter: (value) => formatValue(value, { column }),
        wrap: false,
        sortDirection,
        header: function EditingHeader() {
          return (
            <Box className={S.headerCellContainer}>
              <Ellipsified>{column.display_name}</Ellipsified>
              {sortDirection != null ? (
                <Icon
                  className={S.sortIndicator}
                  data-testid="header-sort-indicator"
                  name={sortDirection === "asc" ? "chevronup" : "chevrondown"}
                  size={10}
                />
              ) : null}
            </Box>
          );
        },
        editingCell: (cellContext) => (
          <EditingBodyCellWrapper
            cellContext={cellContext}
            column={column}
            field={fieldMetadataMap?.[column.name]}
            onCellValueUpdate={onCellValueUpdate}
            onCellEditCancel={onCellEditCancel}
          />
        ),
        getIsCellEditing: (cellId: string) => editingCellId === cellId,
        getCellClassNameByCellId: (cellContext) => {
          const rowIndex = cellContext.row.index;
          const columnName = cellContext.column.id;
          const rowData = rows[rowIndex];
          const rowPkValue = rowData[pkColumnIndex] as RowPkValue;

          const cellUniqKey = getCellUniqKey(rowPkValue, columnName);

          return cellsWithFailedUpdatesMap?.[cellUniqKey]
            ? S.cellWithUpdateFail
            : undefined;
        },
      };

      if (!isEditableColumn) {
        options.getCellClassName = () => S.readonlyCell;
      }

      return options;
    });
  }, [
    cols,
    columnsConfig,
    getColumnSortDirection,
    fieldMetadataMap,
    onCellValueUpdate,
    onCellEditCancel,
    editingCellId,
    rows,
    cellsWithFailedUpdatesMap,
  ]);

  const rowId: RowIdColumnOptions = useMemo(
    () => ({
      variant: "expandButton",
      onRowExpandClick,
    }),
    [onRowExpandClick],
  );

  const columnRowSelectOptions = useMemo<ColumnOptions<RowValues, RowValue>>(
    () => ({
      id: ROW_SELECT_COLUMN_ID,
      name: "",
      size: 35,
      accessorFn: () => null,
      header: ({ table }) => (
        <Flex h="100%" align="center" justify="center">
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            variant="stacked"
          />
        </Flex>
      ),
      cell: ({ row }) => (
        <BaseCell>
          <Flex h="100%" w="100%" align="center" justify="center">
            <Checkbox
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              indeterminate={row.getIsSomeSelected()}
              onChange={row.getToggleSelectedHandler()}
            />
          </Flex>
        </BaseCell>
      ),
    }),
    [],
  );

  const tableProps = useDataGridInstance({
    data: rows,
    rowId: !isRowSelectionEnabled ? rowId : undefined,
    columnOrder,
    columnSizingMap,
    columnsOptions,
    columnVisibility,
    columnPinning: { left: [ROW_ID_COLUMN_ID, ROW_SELECT_COLUMN_ID] },
    enableRowSelection: isRowSelectionEnabled,
    columnRowSelectOptions: isRowSelectionEnabled
      ? columnRowSelectOptions
      : undefined,
    rowActionsColumn:
      rowActions?.length && onActionRun
        ? { actions: rowActions, onActionRun }
        : undefined,
  });

  const rowSelection = tableProps.table.getState().rowSelection;
  useEffect(() => {
    if (isRowSelectionEnabled && onRowSelectionChange) {
      const selectedRowIndices = Object.keys(rowSelection).map(Number);
      onRowSelectionChange(selectedRowIndices);
    }
  }, [rowSelection, onRowSelectionChange, isRowSelectionEnabled]);

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
      const field = fieldMetadataMap?.[columnId];

      if (columnsConfig && columnsConfig.isColumnReadonly(columnId)) {
        return;
      }

      // Disables editing for some columns, such as primary keys
      if (!canEditField(field)) {
        return;
      }

      // Prevents event from bubbling up inside editing cell
      // Otherwise requires special handling in EditingBodyCell
      if (editingCellId !== cellId) {
        onCellClickToEdit(cellId);
      }
    },
    [onCellClickToEdit, editingCellId, fieldMetadataMap, columnsConfig],
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

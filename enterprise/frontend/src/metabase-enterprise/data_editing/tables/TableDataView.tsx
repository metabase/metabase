/* eslint-disable react/prop-types */
import type { ColumnSizingState } from "@tanstack/react-table";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import _ from "underscore";

import {
  type ColumnOptions,
  DataGrid,
  type RowIdColumnOptions,
  useDataGridInstance,
} from "metabase/data-grid";
import { getDefaultCellTemplate } from "metabase/data-grid/utils/columns/data-column";
import { Input } from "metabase/ui";
import { useTableEditing } from "metabase-enterprise/data_editing/tables/use-table-editing";
import type { Dataset, RowValue, RowValues } from "metabase-types/api";

import S from "./TableDataView.module.css";
import type { CellValueUpdateHandlerParameters } from "./types";

type TableDataViewProps = {
  data: Dataset;
  onCellValueUpdate: (params: CellValueUpdateHandlerParameters) => void;
};

export const TableDataView = ({
  data,
  onCellValueUpdate,
}: TableDataViewProps) => {
  const { cols, rows } = data.data;

  const { editingCellsMap, onCellClickToEdit, onCellEditCancel } =
    useTableEditing();

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

      options.cell = function EditingCell(props) {
        const {
          cell,
          getValue,
          row: { index: rowIndex },
        } = props;
        const cellId = cell.id;
        const isEditing = editingCellsMap[cellId];

        const initialValue = getValue();
        const [value, setValue] = useState(initialValue);

        if (isEditing) {
          const handleFieldBlur = () => {
            if (value !== initialValue) {
              // eslint-disable-next-line no-console
              console.log("Update table data, ", props);

              const pkColumnIndex = cols.findIndex(
                ({ semantic_type }) => semantic_type === "type/PK",
              );
              const rowPK = rows[rowIndex][pkColumnIndex];

              if (rowPK !== undefined) {
                onCellValueUpdate({
                  columnId: col.id,
                  rowPK,
                  newValue: value,
                });
              }
            }

            onCellEditCancel(cellId);
          };

          return (
            <Input
              value={value}
              className={S.input}
              variant="unstyled"
              size="xs"
              autoFocus
              onChange={e => setValue(e.target.value)}
              onBlur={handleFieldBlur}
            />
          );
        }

        const CellComponent = getDefaultCellTemplate(options, false, _.noop);

        return <CellComponent {...props} />;
      };

      return options;
    });
  }, [cols, editingCellsMap, onCellEditCancel, onCellValueUpdate, rows]);

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

  const handleCellDoubleClick = useCallback(
    (
      e: React.MouseEvent<HTMLDivElement>,
      rowIndex: number,
      columnId: string,
      value: any,
      cellId: string,
    ) => {
      const column = cols.find(({ name }) => name === columnId); // TODO: refactor to a common id getter
      const row = rows[rowIndex];

      // eslint-disable-next-line no-console
      console.log("Clicked cell", { row, column, value, cellId });

      onCellClickToEdit(cellId);
    },
    [cols, onCellClickToEdit, rows],
  );

  return (
    <DataGrid {...tableProps} onBodyCellDoubleClick={handleCellDoubleClick} />
  );
};

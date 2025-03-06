import type { CellContext, RowData } from "@tanstack/react-table";
import { useCallback, useState } from "react";

import { Input } from "metabase/ui";
import type { DatasetColumn, RowValue } from "metabase-types/api";

import S from "./TableDataView.module.css";
import type { RowCellsWithPkValue } from "./types";

interface EditingBodyCellProps<TRow, TValue> {
  cellContext: CellContext<TRow, TValue>;
  columns: DatasetColumn[];
  onCellValueUpdate: (params: RowCellsWithPkValue) => void;
  onCellEditCancel: (cellId: string) => void;
}

export const EditingBodyCell = <TRow extends RowData, TValue = RowValue>({
  cellContext,
  columns,
  onCellValueUpdate,
  onCellEditCancel,
}: EditingBodyCellProps<TRow, TValue>) => {
  const {
    cell,
    getValue,
    row: { index: rowIndex },
    column: { id: columnName },
  } = cellContext;
  const cellId = cell.id;

  const initialValue = getValue<RowValue>();
  const [value, setValue] = useState<RowValue>(initialValue);

  const handleFieldBlur = useCallback(() => {
    if (value !== initialValue) {
      const pkColumnIndex = columns.findIndex(
        ({ semantic_type }) => semantic_type === "type/PK",
      );
      const pkColumn = columns[pkColumnIndex];
      const rowPkValue = rows[rowIndex][pkColumnIndex];

      if (rowPkValue !== undefined) {
        onCellValueUpdate({
          [pkColumn.name]: rowPkValue,
          [columnName]: value,
        });
      }
    }

    onCellEditCancel(cellId);
  }, [
    cellId,
    columnName,
    columns,
    initialValue,
    onCellEditCancel,
    onCellValueUpdate,
    rowIndex,
    value,
  ]);

  return (
    <Input
      value={value as any} // TODO: fixup this type
      className={S.input}
      variant="unstyled"
      size="xs"
      autoFocus
      onChange={e => setValue(e.target.value)}
      onBlur={handleFieldBlur}
    />
  );
};

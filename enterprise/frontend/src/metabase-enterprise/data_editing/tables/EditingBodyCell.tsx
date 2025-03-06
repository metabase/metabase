import type { CellContext } from "@tanstack/react-table";
import { useCallback, useState } from "react";

import { Input } from "metabase/ui";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import S from "./TableDataView.module.css";
import type { RowCellsWithPkValue } from "./types";

interface EditingBodyCellProps<TRow, TValue> {
  cellContext: CellContext<TRow, TValue>;
  columns: DatasetColumn[];
  onCellValueUpdate: (params: RowCellsWithPkValue) => void;
  onCellEditCancel: (cellId: string) => void;
}

export const EditingBodyCell = ({
  cellContext,
  columns,
  onCellValueUpdate,
  onCellEditCancel,
}: EditingBodyCellProps<RowValues, RowValue>) => {
  const {
    cell,
    getValue,
    row: { original: rowData },
    column: { id: columnName },
  } = cellContext;
  const cellId = cell.id;

  const initialValue = getValue<RowValue>();
  const [value, setValue] = useState<RowValue>(initialValue);

  const handleFieldBlur = useCallback(() => {
    if (value !== initialValue) {
      const pkColumnIndex = columns.findIndex(isPK);
      const pkColumn = columns[pkColumnIndex];
      const rowPkValue = rowData[pkColumnIndex];

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
    rowData,
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

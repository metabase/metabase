import type { CellContext } from "@tanstack/react-table";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useState,
} from "react";

import { Input } from "metabase/ui";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import S from "./TableDataView.module.css";
import type { RowCellsWithPkValue } from "./types";

interface EditingBodyCellProps<TRow, TValue> {
  cellContext: CellContext<TRow, TValue>;
  columns: DatasetColumn[];
  onCellValueUpdate: (params: RowCellsWithPkValue) => void;
  onCellEditCancel: () => void;
}

export const EditingBodyCell = ({
  cellContext,
  columns,
  onCellValueUpdate,
  onCellEditCancel,
}: EditingBodyCellProps<RowValues, RowValue>) => {
  const {
    getValue,
    row: { original: rowData },
    column: { id: columnName },
  } = cellContext;
  const initialValue = getValue<RowValue>();
  const [value, setValue] = useState<RowValue>(initialValue);

  const doCellValueUpdate = useCallback(() => {
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

    onCellEditCancel();
  }, [
    columnName,
    columns,
    initialValue,
    onCellEditCancel,
    onCellValueUpdate,
    rowData,
    value,
  ]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
    [],
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        doCellValueUpdate();
      }
      if (e.key === "Escape") {
        onCellEditCancel();
      }
    },
    [doCellValueUpdate, onCellEditCancel],
  );

  const handleFieldBlur = useCallback(() => {
    doCellValueUpdate();
  }, [doCellValueUpdate]);

  return (
    <Input
      value={value as any} // TODO [Milestone 2]: fixup this type after adding specific inputs based on data type
      className={S.input}
      variant="unstyled"
      size="xs"
      autoFocus
      onChange={handleChange}
      onKeyUp={handleKeyUp}
      onBlur={handleFieldBlur}
    />
  );
};

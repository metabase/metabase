import type { CellContext } from "@tanstack/react-table";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useState,
} from "react";

import { Input } from "metabase/ui";
import type { RowValue, RowValues } from "metabase-types/api";

import S from "./TableDataView.module.css";
import type { UpdatedRowCellsHandlerParams } from "./types";

interface EditingBodyCellProps<TRow, TValue> {
  cellContext: CellContext<TRow, TValue>;
  onCellValueUpdate: (params: UpdatedRowCellsHandlerParams) => void;
  onCellEditCancel: () => void;
}

export const EditingBodyCell = ({
  cellContext,
  onCellValueUpdate,
  onCellEditCancel,
}: EditingBodyCellProps<RowValues, RowValue>) => {
  const {
    getValue,
    row: { index: rowIndex },
    column: { id: columnName },
  } = cellContext;
  const initialValue = getValue<RowValue>();
  const [value, setValue] = useState<RowValue>(initialValue);

  const doCellValueUpdate = useCallback(() => {
    if (value !== initialValue) {
      onCellValueUpdate({
        data: {
          [columnName]: value,
        },
        rowIndex,
      });
    }

    onCellEditCancel();
  }, [
    columnName,
    initialValue,
    onCellEditCancel,
    onCellValueUpdate,
    rowIndex,
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

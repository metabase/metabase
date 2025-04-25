import type { CellContext } from "@tanstack/react-table";
import { useCallback } from "react";

import type {
  DatasetColumn,
  FieldWithMetadata,
  RowValue,
  RowValues,
} from "metabase-types/api";

import S from "./EditingBodyCell.module.css";
import { EditingBodyCellConditional } from "./inputs";

interface EditingBodyCellWrapperProps<TRow, TValue> {
  column: DatasetColumn;
  field?: FieldWithMetadata;
  cellContext: CellContext<TRow, TValue>;
  onCellValueUpdate: (rowIndex: number, data: Record<string, RowValue>) => void;
  onCellEditCancel: () => void;
}

export const EditingBodyCellWrapper = (
  props: EditingBodyCellWrapperProps<RowValues, RowValue>,
) => {
  const {
    onCellEditCancel,
    onCellValueUpdate,
    column,
    field,
    cellContext: {
      getValue,
      column: { id: columnName },
      row: { index: rowIndex },
    },
  } = props;

  const initialValue = getValue<RowValue>();

  const doCellValueUpdate = useCallback(
    (value: RowValue) => {
      if (value !== initialValue) {
        onCellValueUpdate(rowIndex, { [columnName]: value });
      }

      // Hide the editing cell after submitting the value
      onCellEditCancel();
    },
    [columnName, onCellEditCancel, onCellValueUpdate, rowIndex, initialValue],
  );

  return (
    <EditingBodyCellConditional
      autoFocus
      inputProps={{
        variant: "unstyled",
        size: "sm",
      }}
      classNames={{
        textInputElement: S.inlineEditingTextInput,
        selectTextInputElement: S.inlineEditingTextInput,
        dateTextInputElement: S.inlineEditingTextInput,
      }}
      field={field}
      initialValue={initialValue}
      datasetColumn={column}
      onSubmit={doCellValueUpdate}
      onCancel={onCellEditCancel}
    />
  );
};

import type { CellContext } from "@tanstack/react-table";
import { useCallback } from "react";

import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import type { UpdatedRowCellsHandlerParams } from "../types";

import S from "./EditingBodyCell.module.css";
import { EditingBodyCellConditional } from "./inputs";

interface EditingBodyCellWrapperProps<TRow, TValue> {
  column: DatasetColumn;
  cellContext: CellContext<TRow, TValue>;
  onCellValueUpdate: (params: UpdatedRowCellsHandlerParams) => void;
  onCellEditCancel: () => void;
}

export const EditingBodyCellWrapper = (
  props: EditingBodyCellWrapperProps<RowValues, RowValue>,
) => {
  const {
    onCellEditCancel,
    onCellValueUpdate,
    column,
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
        onCellValueUpdate({
          updatedData: { [columnName]: value },
          rowIndex,
        });
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
        className: S.inlineEditingInput,
        size: "sm",
      }}
      initialValue={initialValue}
      datasetColumn={column}
      onSubmit={doCellValueUpdate}
      onCancel={onCellEditCancel}
    />
  );
};

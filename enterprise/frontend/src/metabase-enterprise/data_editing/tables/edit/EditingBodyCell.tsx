import type { CellContext } from "@tanstack/react-table";
import { useCallback } from "react";

import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import type { UpdatedRowCellsHandlerParams } from "../types";

import {
  EditingBodyCellBasicInput,
  EditingBodyCellCategorySelect,
  EditingBodyCellDatetime,
  EditingBodyCellFKSelect,
} from "./inputs";

interface EditingBodyCellProps<TRow, TValue> {
  column: DatasetColumn;
  cellContext: CellContext<TRow, TValue>;
  onCellValueUpdate: (params: UpdatedRowCellsHandlerParams) => void;
  onCellEditCancel: () => void;
}

export const EditingBodyCellConditional = (
  props: EditingBodyCellProps<RowValues, RowValue>,
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
          data: { [columnName]: value },
          rowIndex,
        });
      }

      // Hide the editing cell after submitting the value
      onCellEditCancel();
    },
    [columnName, onCellEditCancel, onCellValueUpdate, rowIndex, initialValue],
  );

  if (
    column.semantic_type === "type/State" ||
    column.semantic_type === "type/Country" ||
    column.semantic_type === "type/Category"
  ) {
    return (
      <EditingBodyCellCategorySelect
        initialValue={initialValue}
        datasetColumn={column}
        onSubmit={doCellValueUpdate}
        onCancel={onCellEditCancel}
      />
    );
  }

  if (column.semantic_type === "type/FK") {
    return (
      <EditingBodyCellFKSelect
        initialValue={initialValue}
        datasetColumn={column}
        onSubmit={doCellValueUpdate}
        onCancel={onCellEditCancel}
      />
    );
  }

  if (
    column.effective_type === "type/Date" ||
    column.effective_type === "type/DateTime" ||
    column.effective_type === "type/DateTimeWithLocalTZ"
  ) {
    return (
      <EditingBodyCellDatetime
        initialValue={initialValue}
        datasetColumn={column}
        onSubmit={doCellValueUpdate}
        onCancel={onCellEditCancel}
      />
    );
  }

  return (
    <EditingBodyCellBasicInput
      initialValue={initialValue}
      datasetColumn={column}
      onSubmit={doCellValueUpdate}
      onCancel={onCellEditCancel}
    />
  );
};

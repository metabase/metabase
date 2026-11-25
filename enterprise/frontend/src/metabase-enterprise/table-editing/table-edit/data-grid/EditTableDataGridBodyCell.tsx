import type { CellContext } from "@tanstack/react-table";
import cx from "classnames";
import { useCallback } from "react";

import { BodyCell } from "metabase/data-grid";
import { useDataGridTheme } from "metabase/data-grid/hooks";
import { getDefaultCellBackgroundColor } from "metabase/data-grid/utils/striped-background-color";
import { formatValue } from "metabase/value-formatting";
import { ParameterActionInput } from "metabase-enterprise/table-editing/inputs/ParameterActionInput";
import type { RowValue, RowValues } from "metabase-types/api";

import { useEditTableDataGridContext } from "./EditTableDataGridContext";
import S from "./TableEditingCell.module.css";
import { EditDataGridCellState } from "./use-edit-datagrid-cell-state";

type EditTableDataGridBodyCellProps = CellContext<RowValues, RowValue> & {
  isSelected?: boolean;
  isStriped?: boolean;
};

export function EditTableDataGridBodyCell({
  getValue,
  row,
  column,
  isSelected,
  isStriped,
}: EditTableDataGridBodyCellProps) {
  const {
    columnsByName,
    parametersByName,
    editingCell,
    getCellState,
    onCancelEditing,
    onValueUpdated,
  } = useEditTableDataGridContext();
  const theme = useDataGridTheme();
  const datasetColumn = columnsByName.get(column.id);
  // Each dataset's column carries the foreign key display names of its own rows
  const formatter = useCallback(
    (value: RowValue) => formatValue(value, { column: datasetColumn }),
    [datasetColumn],
  );
  const value = getValue();
  const parameter = parametersByName.get(column.id);
  const isEditing =
    parameter != null &&
    editingCell?.columnId === column.id &&
    editingCell?.rowIndex === row.index;

  if (isEditing) {
    return (
      <ParameterActionInput
        parameter={parameter}
        autoFocus
        initialValue={value?.toString()}
        inputProps={{
          variant: "unstyled",
          size: "sm",
        }}
        classNames={{
          root: S.inlineEditingInputWrapper,
          wrapper: S.inlineEditingInputWrapper,
          textInputElement: S.inlineEditingTextInput,
          numberInputElement: S.inlineEditingTextInput,
          selectTextInputElement: S.inlineEditingTextInput,
          dateTextInputElement: S.inlineEditingTextInput,
          selectLabel: S.selectLabel,
        }}
        onEscape={onCancelEditing}
        onEnter={onValueUpdated}
        onBlur={onValueUpdated}
      />
    );
  }

  const { wrap, isTruncated = false, onExpand } = column.columnDef.meta ?? {};
  const isReadonly = Boolean(parameter?.readonly);
  const cellState = getCellState(column.id, row.index);
  const editableCellClassName = cx(S.cell, {
    [S.updatingCell]: cellState === EditDataGridCellState.Updating,
    [S.errorCell]: cellState === EditDataGridCellState.Error,
  });

  return (
    <BodyCell
      isSelected={isSelected}
      rowIndex={row.index}
      columnId={column.id}
      value={value}
      canExpand={!wrap && isTruncated}
      formatter={formatter}
      backgroundColor={getDefaultCellBackgroundColor(theme, isStriped)}
      onExpand={onExpand}
      wrap={wrap}
      className={isReadonly ? S.readonlyCell : editableCellClassName}
    />
  );
}

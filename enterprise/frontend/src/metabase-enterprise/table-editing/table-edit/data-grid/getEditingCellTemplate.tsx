import type { CellContext } from "@tanstack/react-table";

import type { TableActionFormParameter } from "metabase-enterprise/table-editing/api/types";
import { ParameterActionInput } from "metabase-enterprise/table-editing/inputs/ParameterActionInput";
import type { RowValue, RowValues } from "metabase-types/api";

import S from "./TableEditingCell.module.css";

type Props = {
  parameterDescription: TableActionFormParameter;
  onValueUpdated: (value: string | null) => void;
  onCancelEditing: () => void;
};

export function getEditingCellTemplate({
  parameterDescription,
  onValueUpdated,
  onCancelEditing,
}: Props) {
  return function EditingCell(props: CellContext<RowValues, RowValue>) {
    return (
      <ParameterActionInput
        parameter={parameterDescription}
        autoFocus
        initialValue={props.getValue()?.toString()}
        inputProps={{
          variant: "unstyled",
          size: "sm",
        }}
        classNames={{
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
  };
}

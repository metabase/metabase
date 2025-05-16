import { t } from "ttag";

import { canEditField } from "../../../helpers";

import { EditingBodyCellBasicInput } from "./EditingBodyCellBasicInput";
import { EditingBodyCellCategorySelect } from "./EditingBodyCellCategorySelect";
import { EditingBodyCellDatetime } from "./EditingBodyCellDatetime";
import { EditingBodyCellFKSelect } from "./EditingBodyCellFKSelect";
import type { EditingBodyPrimitiveProps } from "./types";

export const EditingBodyCellConditional = (
  props: EditingBodyPrimitiveProps,
) => {
  const { datasetColumn: column, field, inputProps } = props;

  const disabled = !canEditField(field);
  const placeholder = field?.database_default
    ? t`Auto populated`
    : field?.database_is_nullable
      ? t`Optional`
      : props.inputProps?.placeholder;

  if (
    column.semantic_type === "type/State" ||
    column.semantic_type === "type/Country" ||
    column.semantic_type === "type/Category"
  ) {
    return (
      <EditingBodyCellCategorySelect
        {...props}
        inputProps={{ placeholder, disabled, ...inputProps }}
      />
    );
  }

  if (column.semantic_type === "type/FK") {
    return (
      <EditingBodyCellFKSelect
        {...props}
        inputProps={{ placeholder, disabled, ...inputProps }}
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
        {...props}
        inputProps={{ placeholder, disabled, ...inputProps }}
      />
    );
  }

  return (
    <EditingBodyCellBasicInput
      {...props}
      inputProps={{ placeholder, disabled, ...inputProps }}
    />
  );
};

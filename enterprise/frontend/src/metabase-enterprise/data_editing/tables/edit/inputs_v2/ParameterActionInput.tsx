import { t } from "ttag";

import type { ActionFormParameter } from "../../types";
import { ActionFormParameterType } from "../../types";

import { ActionInputDateTime } from "./ActionInputDateTime";
import { ActionInputSearchableSelect } from "./ActionInputSearchableSelect";
import { ActionInputText } from "./ActionInputText";
import { ActionInputTextarea } from "./ActionInputTextarea";
import type { ActionInputSharedProps } from "./types";

type ParameterActionInputProps = ActionInputSharedProps & {
  parameter: ActionFormParameter;
};

export function ParameterActionInput(props: ParameterActionInputProps) {
  const { parameter, ...rest } = props;

  // TOOD: add `Auto populated` label for db-generated values when BE supports it
  const placeholder = parameter.optional ? t`Optional` : undefined;
  const disabled = parameter.readonly;

  const inputProps = {
    ...rest.inputProps,
    placeholder,
    disabled,
  };

  if (parameter.type === ActionFormParameterType.Date) {
    return <ActionInputDateTime {...rest} inputProps={inputProps} />;
  }

  if (parameter.type === ActionFormParameterType.DateTime) {
    return <ActionInputDateTime {...rest} inputProps={inputProps} isDateTime />;
  }

  if (parameter.semantic_type === "type/Description") {
    return <ActionInputTextarea {...rest} inputProps={inputProps} />;
  }

  if (
    parameter.semantic_type === "type/State" ||
    parameter.semantic_type === "type/Country" ||
    parameter.semantic_type === "type/Category"
  ) {
    if (parameter.field_id) {
      return (
        <ActionInputSearchableSelect
          {...rest}
          inputProps={inputProps}
          fieldId={parameter.field_id}
          withCreateNew
        />
      );
    }
  }

  if (parameter.semantic_type === "type/FK") {
    if (parameter.field_id) {
      return (
        <ActionInputSearchableSelect
          {...rest}
          inputProps={inputProps}
          fieldId={parameter.field_id}
          searchFieldId={parameter.fk_target_field_id}
        />
      );
    }
  }

  return <ActionInputText {...rest} inputProps={inputProps} />;
}

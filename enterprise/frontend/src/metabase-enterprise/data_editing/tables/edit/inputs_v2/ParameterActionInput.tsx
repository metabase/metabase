import { t } from "ttag";

import type { ActionFormParameter } from "../../types";
import { ActionFormInputType } from "../../types";

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

  const placeholder = parameter.database_default
    ? t`Auto populated`
    : parameter.optional
      ? t`Optional`
      : undefined;

  const disabled = parameter.readonly;

  const inputProps = {
    ...rest.inputProps,
    placeholder,
    disabled,
  };

  switch (parameter.input_type) {
    case ActionFormInputType.Date:
      return <ActionInputDateTime {...rest} inputProps={inputProps} />;
    case ActionFormInputType.DateTime:
      return (
        <ActionInputDateTime {...rest} inputProps={inputProps} isDateTime />
      );
    case ActionFormInputType.Textarea:
      return <ActionInputTextarea {...rest} inputProps={inputProps} />;
    case ActionFormInputType.Dropdown:
      if (parameter.field_id) {
        return (
          <ActionInputSearchableSelect
            {...rest}
            inputProps={inputProps}
            fieldId={parameter.field_id}
            searchFieldId={parameter.human_readable_field_id}
            withCreateNew
          />
        );
      }
  }

  return <ActionInputText {...rest} inputProps={inputProps} />;
}

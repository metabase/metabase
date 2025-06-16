import type { ActionFormParameter } from "../../types";
import { ActionFormInputType } from "../../types";

import { ActionInputDateTime } from "./ActionInputDateTime";
import { ActionInputSearchableSelect } from "./ActionInputSearchableSelect";
import { ActionInputText } from "./ActionInputText";
import { ActionInputTextarea } from "./ActionInputTextarea";
import type { ActionInputSharedProps } from "./types";

export type ParameterActionInputProps = ActionInputSharedProps & {
  parameter: ActionFormParameter;
};

export function ParameterActionInput(props: ParameterActionInputProps) {
  const { parameter, ...rest } = props;

  switch (parameter.input_type) {
    case ActionFormInputType.Date:
      return <ActionInputDateTime {...rest} />;
    case ActionFormInputType.DateTime:
      return <ActionInputDateTime {...rest} isDateTime />;
    case ActionFormInputType.Textarea:
      return <ActionInputTextarea {...rest} />;
    case ActionFormInputType.Dropdown:
      if (parameter.field_id) {
        return (
          <ActionInputSearchableSelect
            {...rest}
            fieldId={parameter.field_id}
            searchFieldId={parameter.human_readable_field_id}
            isNullable={parameter.nullable}
            withCreateNew
          />
        );
      }
  }

  return <ActionInputText {...rest} />;
}

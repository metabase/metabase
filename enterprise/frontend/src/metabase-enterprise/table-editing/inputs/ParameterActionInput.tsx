import type { ActionFormParameter } from "../api/types";
import { ActionFormInputType } from "../api/types";

import { TableActionInputDateTime } from "./TableActionInputDateTime";
import { TableActionInputSearchableSelect } from "./TableActionInputSearchableSelect";
import { TableActionInputText } from "./TableActionInputText";
import { TableActionInputTextarea } from "./TableActionInputTextarea";
import type { TableActionInputSharedProps } from "./types";

export type ParameterActionInputProps = TableActionInputSharedProps & {
  parameter: ActionFormParameter;
};

export function ParameterActionInput(props: ParameterActionInputProps) {
  const { parameter, ...rest } = props;

  switch (parameter.input_type) {
    case ActionFormInputType.Date:
      return <TableActionInputDateTime {...rest} />;
    case ActionFormInputType.DateTime:
      return <TableActionInputDateTime {...rest} isDateTime />;
    case ActionFormInputType.Textarea:
      return <TableActionInputTextarea {...rest} />;
    case ActionFormInputType.Dropdown:
      if (parameter.field_id) {
        return (
          <TableActionInputSearchableSelect
            {...rest}
            fieldId={parameter.field_id}
            searchFieldId={parameter.human_readable_field_id}
            isNullable={parameter.nullable}
            withCreateNew
          />
        );
      }
  }

  return <TableActionInputText {...rest} />;
}

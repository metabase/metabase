import type { TableActionFormParameter } from "../api/types";
import { TableActionFormInputType } from "../api/types";

import { TableActionInputDateTime } from "./TableActionInputDateTime";
import { TableActionInputSearchableSelect } from "./TableActionInputSearchableSelect";
import { TableActionInputText } from "./TableActionInputText";
import { TableActionInputTextarea } from "./TableActionInputTextarea";
import type { TableActionInputSharedProps } from "./types";

export type ParameterActionInputProps = TableActionInputSharedProps & {
  parameter: TableActionFormParameter;
};

export function ParameterActionInput(props: ParameterActionInputProps) {
  const { parameter, ...rest } = props;

  switch (parameter.input_type) {
    case TableActionFormInputType.Date:
      return <TableActionInputDateTime {...rest} />;
    case TableActionFormInputType.DateTime:
      return <TableActionInputDateTime {...rest} isDateTime />;
    case TableActionFormInputType.Textarea:
      return <TableActionInputTextarea {...rest} />;
    case TableActionFormInputType.Dropdown:
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

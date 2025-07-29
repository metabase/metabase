import type { TableActionFormParameter } from "../api/types";
import { TableActionFormInputType } from "../api/types";

import {
  TableActionInputDate,
  type TableActionInputDateProps,
} from "./TableActionInputDate";
import {
  TableActionInputDateTime,
  type TableActionInputDateTimeProps,
} from "./TableActionInputDateTime";
import {
  TableActionInputSearchableSelect,
  type TableActionInputSearchableSelectProps,
} from "./TableActionInputSearchableSelect";
import {
  TableActionInputText,
  type TableActionInputTextProps,
} from "./TableActionInputText";
import {
  TableActionInputTextarea,
  type TableActionInputTextareaProps,
} from "./TableActionInputTextarea";

type TableActionInputProps =
  | TableActionInputDateProps
  | TableActionInputDateTimeProps
  | TableActionInputTextProps
  | TableActionInputTextareaProps
  | TableActionInputSearchableSelectProps;

export type ParameterActionInputProps = TableActionInputProps & {
  parameter: TableActionFormParameter;
};

export function ParameterActionInput(props: ParameterActionInputProps) {
  const { parameter, ...rest } = props;

  switch (parameter.input_type) {
    case TableActionFormInputType.Date:
      return <TableActionInputDate {...rest} />;
    case TableActionFormInputType.DateTime:
      return <TableActionInputDateTime {...rest} />;
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
            withCreateNew={!parameter.human_readable_field_id}
          />
        );
      }
  }

  return <TableActionInputText {...rest} />;
}

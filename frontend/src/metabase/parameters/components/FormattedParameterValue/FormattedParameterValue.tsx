import React from "react";

import { formatParameterValue } from "metabase/parameters/utils/formatting";
import ParameterFieldWidgetValue from "metabase/parameters/components/widgets/ParameterFieldWidget/ParameterFieldWidgetValue/ParameterFieldWidgetValue";
import {
  UiParameter,
  FieldFilterUiParameter,
} from "metabase-lib/parameters/types";
import { isDateParameter } from "metabase-lib/parameters/utils/parameter-type";

type FormattedParameterValueProps = {
  parameter: UiParameter;
  value: string | number | number[];
  placeholder?: string;
};

function FormattedParameterValue({
  parameter,
  value,
  placeholder,
}: FormattedParameterValueProps) {
  if (value == null) {
    return placeholder;
  }

  if (hasFields(parameter) && !isDateParameter(parameter)) {
    return (
      <ParameterFieldWidgetValue fields={parameter.fields} value={value} />
    );
  }

  return <span>{formatParameterValue(value, parameter)}</span>;
}

function hasFields(
  parameter: UiParameter,
): parameter is FieldFilterUiParameter {
  return !!(parameter as FieldFilterUiParameter).fields;
}

export default FormattedParameterValue;

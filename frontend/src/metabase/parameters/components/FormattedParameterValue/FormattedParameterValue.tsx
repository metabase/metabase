import React from "react";

import { formatParameterValue } from "metabase/parameters/utils/formatting";
import { isDateParameter } from "metabase/parameters/utils/parameter-type";
import { UiParameter, FieldFilterUiParameter } from "metabase/parameters/types";
import ParameterFieldWidgetValue from "metabase/parameters/components/widgets/ParameterFieldWidget/ParameterFieldWidgetValue/ParameterFieldWidgetValue";

type FormattedParameterValueProps = {
  parameter: UiParameter;
  value: unknown;
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

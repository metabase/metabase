import { formatValue } from "metabase/lib/formatting";

import { getParameterType, isFieldFilterParameter } from "./parameter-type";
import { formatDateValue } from "./date-formatting";
import { UiParameter } from "../types";

function inferValueType(parameter: UiParameter) {
  const type = getParameterType(parameter);
  if (type === "number") {
    return "type/Number";
  }

  return "type/Text";
}

function formatWithInferredType(value: any, parameter: UiParameter) {
  const inferredType = inferValueType(parameter);
  const column = {
    base_type: inferredType,
  };
  return formatValue(value, {
    column,
    maximumFractionDigits: 20,
  });
}

export function formatParameterValue(value: any, parameter: UiParameter) {
  const type = getParameterType(parameter);
  if (type === "date") {
    return formatDateValue(value, parameter);
  }

  if (isFieldFilterParameter(parameter) && parameter.fields.length > 0) {
    const [firstField] = parameter.fields;
    const remap = parameter.fields.length === 1;
    return formatValue(value, {
      column: firstField,
      maximumFractionDigits: 20,
      remap,
    });
  }

  return formatWithInferredType(value, parameter);
}

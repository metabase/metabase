import { ngettext, msgid } from "ttag";

import { formatValue } from "metabase/lib/formatting";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  getFields,
  hasFields,
} from "metabase-lib/v1/parameters/utils/parameter-fields";
import {
  isFieldFilterParameter,
  getParameterType,
} from "metabase-lib/v1/parameters/utils/parameter-type";

import { formatDateValue } from "./date-formatting";

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

export function formatParameterValue(
  value: string | number | number[],
  parameter: UiParameter,
) {
  if (Array.isArray(value) && value.length > 1) {
    return renderNumberOfSelections(value.length);
  }

  value = Array.isArray(value) ? value[0] : value;

  const type = getParameterType(parameter);
  if (type === "date") {
    return formatDateValue(String(value), parameter);
  }

  if (isFieldFilterParameter(parameter)) {
    // skip formatting field filter parameters mapped to native query variables
    if (parameter.hasVariableTemplateTagTarget) {
      return value;
    }

    // format using the parameter's first targeted field
    if (hasFields(parameter)) {
      const fields = getFields(parameter);
      const [firstField] = fields;
      // when a parameter targets multiple fields we won't know
      // which parameter the value is associated with, meaning we
      // are unable to remap the value to the correct field
      const remap = fields.length === 1;
      return formatValue(value as string, {
        column: firstField,
        maximumFractionDigits: 20,
        remap,
      });
    }
  }

  // infer type information from parameter type
  return formatWithInferredType(value, parameter);
}

export function renderNumberOfSelections(numberOfSelections: number) {
  return ngettext(
    msgid`${numberOfSelections} selection`,
    `${numberOfSelections} selections`,
    numberOfSelections,
  );
}

import { isEmpty } from "metabase/lib/validate";

import type {
  FieldSettings,
  ParametersForActionExecution,
} from "metabase-types/api";

// set user-defined default values for any non-required empty parameters
export function setDefaultValues(
  params: ParametersForActionExecution,
  fieldSettings: { [tagId: string]: FieldSettings },
) {
  Object.entries(params).forEach(([key, value]) => {
    if (isEmpty(value) && fieldSettings[key] && !fieldSettings[key].required) {
      params[key] = fieldSettings[key].defaultValue ?? "";
    }
  });

  return params;
}

export function setNumericValues(
  params: ParametersForActionExecution,
  fieldSettings: { [tagId: string]: FieldSettings },
) {
  Object.entries(params).forEach(([key, value]) => {
    if (fieldSettings[key]?.fieldType === "number") {
      params[key] = Number(value) ?? 0;
    }
  });

  return params;
}

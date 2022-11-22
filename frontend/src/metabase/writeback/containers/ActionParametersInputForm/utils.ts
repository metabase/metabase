import moment from "moment-timezone";
import { isEmpty } from "metabase/lib/validate";

import type {
  FieldSettings,
  ParametersForActionExecution,
  ActionFormProps,
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
    if (fieldSettings[key]?.fieldType === "number" && !isEmpty(value)) {
      params[key] = Number(value) ?? null;
    }
  });

  return params;
}

export const getChangedValues = (
  newValues: ParametersForActionExecution,
  oldValues: ParametersForActionExecution,
) => {
  const changedValues = Object.entries(newValues).filter(
    ([newKey, newValue]) => {
      const oldValue = oldValues[newKey];

      // don't flag a change when the input changes itself to an empty string
      if (oldValue === null && newValue === "") {
        return false;
      }
      return newValue !== oldValue;
    },
  );

  return Object.fromEntries(changedValues);
};

export const formatValue = (
  value: string | number | null,
  inputType?: string,
) => {
  if (!isEmpty(value)) {
    if (inputType === "date" && moment(value).isValid()) {
      return moment(value).utc(false).format("YYYY-MM-DD");
    }
    if (inputType === "datetime-local" && moment(value).isValid()) {
      return moment(value).utc(false).format("YYYY-MM-DDTHH:mm:ss");
    }
    if (inputType === "time") {
      return String(value).replace(/z/gi, "");
    }
  }
  return value;
};

// maps intial values, if any, into an intialValues map
export const getInitialValues = (
  form: ActionFormProps,
  prefetchValues: ParametersForActionExecution,
) => {
  return Object.fromEntries(
    form.fields.map(field => [
      field.name,
      formatValue(prefetchValues[field.name], field.type),
    ]),
  );
};

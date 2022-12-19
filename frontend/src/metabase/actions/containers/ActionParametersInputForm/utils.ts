import moment from "moment-timezone";
import { isEmpty } from "metabase/lib/validate";

import type {
  FieldSettings,
  InputSettingType,
  ParametersForActionExecution,
  ActionFormProps,
  FieldSettingsMap,
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
  oldValues: Partial<ParametersForActionExecution>,
) => {
  const changedValues = Object.entries(newValues).filter(
    ([newKey, newValue]) => {
      const oldValue = oldValues[newKey];
      const hadUnsetValue = oldValue === null || oldValue === undefined;

      // don't flag a change when the input changes itself to an empty string
      if (hadUnsetValue && newValue === "") {
        return false;
      }
      return newValue !== oldValue;
    },
  );

  return Object.fromEntries(changedValues);
};

export const formatValue = (
  value: string | number | null,
  inputType?: InputSettingType,
) => {
  if (!isEmpty(value)) {
    if (inputType === "date" && moment(value).isValid()) {
      return moment(value).utc(false).format("YYYY-MM-DD");
    }
    if (inputType === "datetime" && moment(value).isValid()) {
      return moment(value).utc(false).format("YYYY-MM-DDTHH:mm:ss");
    }
    if (inputType === "time") {
      return String(value).replace(/z/gi, "");
    }
  }
  return value;
};

// maps initial values, if any, into an initialValues map
export const getInitialValues = (
  fieldSettings: FieldSettingsMap,
  prefetchValues: ParametersForActionExecution,
) => {
  return Object.fromEntries(
    Object.values(fieldSettings).map(field => [
      field.id,
      formatValue(prefetchValues[field.id], field.inputType),
    ]),
  );
};

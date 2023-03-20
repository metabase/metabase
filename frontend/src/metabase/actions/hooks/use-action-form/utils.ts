import moment from "moment-timezone";
import { isEmpty } from "metabase/lib/validate";

import type {
  FieldSettingsMap,
  InputSettingType,
  ParametersForActionExecution,
} from "metabase-types/api";

export function stripTZInfo(dateOrTimeString: string) {
  // strip everything after a trailing tz (e.g. +08:00)
  return moment(dateOrTimeString.replace(/(\+|-)\d{2}:\d{2}$/, "")).utc(true);
}

export const formatInitialValue = (
  value: string | number | null,
  inputType?: InputSettingType,
) => {
  if (!isEmpty(value) && typeof value === "string") {
    if (inputType === "date" && moment(value).isValid()) {
      return moment(stripTZInfo(value)).format("YYYY-MM-DD");
    }
    if (inputType === "datetime" && moment(value).isValid()) {
      return moment(stripTZInfo(value)).format("YYYY-MM-DDTHH:mm:ss");
    }
    if (inputType === "time") {
      return moment(stripTZInfo(`2020-01-10T${value}`)).format("HH:mm:ss");
    }
  }
  return value;
};

export const formatSubmitValues = (
  rawValues: ParametersForActionExecution,
  fieldSettings: FieldSettingsMap,
) => {
  const values: ParametersForActionExecution = {};

  Object.entries(rawValues).forEach(([fieldId, fieldValue]) => {
    values[fieldId] = fieldValue;

    const formField = fieldSettings[fieldId];
    const isNumericField = formField?.fieldType === "number";
    if (isNumericField && !isEmpty(fieldValue)) {
      values[fieldId] = Number(fieldValue) ?? null;
    }
  });

  return values;
};

export const getChangedValues = (
  values: ParametersForActionExecution,
  initialValues: Partial<ParametersForActionExecution>,
) => {
  const changedValues = Object.entries(values).filter(([key, value]) => {
    const initialValue = initialValues[key];
    return value !== initialValue;
  });
  return Object.fromEntries(changedValues);
};

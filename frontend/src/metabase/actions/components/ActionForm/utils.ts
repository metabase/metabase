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

const formatSubmitValues = (
  values: ParametersForActionExecution,
  fieldSettings: FieldSettingsMap,
) => {
  const clean: ParametersForActionExecution = {};

  Object.entries(values).forEach(([fieldId, fieldValue]) => {
    clean[fieldId] = fieldValue;

    const formField = fieldSettings[fieldId];
    const isNumericField = formField?.fieldType === "number";
    if (isNumericField && !isEmpty(fieldValue)) {
      clean[fieldId] = Number(fieldValue) ?? null;
    }
  });

  return clean;
};

const getChangedValues = (
  values: ParametersForActionExecution,
  initialValues: Partial<ParametersForActionExecution>,
) => {
  const changedValues = Object.entries(values).filter(([key, value]) => {
    const initialValue = initialValues[key];
    return value !== initialValue;
  });
  return Object.fromEntries(changedValues);
};

export const cleanSubmitValues = ({
  values,
  initialValues,
  fieldSettings,
}: {
  values: ParametersForActionExecution;
  initialValues: Partial<ParametersForActionExecution>;
  fieldSettings: FieldSettingsMap;
}) => {
  const formatted = formatSubmitValues(values, fieldSettings);
  return getChangedValues(formatted, initialValues);
};

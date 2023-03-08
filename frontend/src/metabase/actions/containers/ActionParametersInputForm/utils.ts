import moment from "moment-timezone";
import { isEmpty } from "metabase/lib/validate";

import type {
  InputSettingType,
  ParametersForActionExecution,
  FieldSettingsMap,
} from "metabase-types/api";

export const getChangedValues = (
  newValues: ParametersForActionExecution,
  oldValues: Partial<ParametersForActionExecution>,
) => {
  const changedValues = Object.entries(newValues).filter(
    ([newKey, newValue]) => {
      const oldValue = oldValues[newKey];
      return newValue !== oldValue;
    },
  );

  return Object.fromEntries(changedValues);
};

export const formatValue = (
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

export function stripTZInfo(dateOrTimeString: string) {
  // strip everything after a trailing tz (e.g. +08:00)
  return moment(dateOrTimeString.replace(/(\+|-)\d{2}:\d{2}$/, "")).utc(true);
}

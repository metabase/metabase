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
  if (!isEmpty(value)) {
    if (inputType === "date" && moment(value).isValid()) {
      return moment(value).utc(true).format("YYYY-MM-DD");
    }
    if (inputType === "datetime" && moment(value).isValid()) {
      return moment(value).utc(true).format("YYYY-MM-DDTHH:mm:ss");
    }
    if (inputType === "time") {
      return moment(`2020-01-10 ${value}`).utc(true).format("HH:mm:ss");
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

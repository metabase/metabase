import dayjs from "dayjs";

import type { FieldSettings as LocalFieldSettings } from "metabase/actions/types";
import { getDefaultFieldSettings } from "metabase/actions/utils";
import { isEmpty } from "metabase/lib/validate";
import { getParameterType } from "metabase-lib/v1/parameters/utils/parameter-type";
import type {
  FieldSettings,
  FieldSettingsMap,
  InputSettingType,
  Parameter,
  ParameterId,
  ParametersForActionExecution,
} from "metabase-types/api";

export function stripTZInfo(dateOrTimeString: string) {
  // strip everything after a trailing tz (e.g. +08:00)
  return dayjs(dateOrTimeString.replace(/(\+|-)\d{2}:\d{2}$/, "")).utc(true);
}

export const formatInitialValue = (
  value: string | number | boolean | null,
  inputType?: InputSettingType,
) => {
  if (!isEmpty(value) && typeof value === "string") {
    if (inputType === "date" && dayjs(value).isValid()) {
      return dayjs(stripTZInfo(value)).format("YYYY-MM-DD");
    }
    if (inputType === "datetime" && dayjs(value).isValid()) {
      return dayjs(stripTZInfo(value)).format("YYYY-MM-DDTHH:mm:ss");
    }
    if (inputType === "time") {
      return dayjs(stripTZInfo(`2020-01-10T${value}`)).format("HH:mm:ss");
    }
  }

  return value;
};

export const formatSubmitValues = (
  rawValues: ParametersForActionExecution,
  fieldSettings: FieldSettingsMap,
) => {
  const values: ParametersForActionExecution = {};

  Object.entries(rawValues)
    .filter(([fieldId]) => !fieldSettings[fieldId].hidden)
    .forEach(([fieldId, fieldValue]) => {
      values[fieldId] = fieldValue;

      const formField = fieldSettings[fieldId];
      const isNumericField = formField?.fieldType === "number";
      if (isNumericField && !isEmpty(fieldValue)) {
        values[fieldId] = Number(fieldValue);
      }
    });

  return values;
};

const getFieldType = (param: Parameter): "number" | "string" => {
  return getParameterType(param) === "number" ? "number" : "string";
};

export const getInputType = (param: Parameter): InputSettingType => {
  const type = getParameterType(param);
  switch (type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "date":
      return "datetime";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
};

// TODO: @uladzimirdev remove this method once the migration of implicit action fields generating to the BE is complete
export const getOrGenerateFieldSettings = (
  params: Parameter[],
  fields?: Record<
    ParameterId,
    Partial<FieldSettings> & Pick<FieldSettings, "id" | "hidden">
  >,
) => {
  if (!fields) {
    return generateFieldSettingsFromParameters(params);
  }

  const fieldValues = Object.values(fields);
  const isGeneratedImplicitActionField =
    fieldValues.length > 0 && Object.keys(fieldValues[0]).length === 2;

  if (isGeneratedImplicitActionField) {
    const generatedFieldSettings = generateFieldSettingsFromParameters(params);

    fieldValues.forEach((fieldValue) => {
      const singleFieldSettings = generatedFieldSettings[fieldValue.id];
      // this is the only field we sync with BE
      singleFieldSettings.hidden = fieldValue.hidden;
    });

    return generatedFieldSettings;
  }

  // settings are in sync with BE
  return fields as FieldSettingsMap;
};

export const generateFieldSettingsFromParameters = (params: Parameter[]) => {
  const fieldSettings: Record<ParameterId, LocalFieldSettings> = {};

  params.forEach((param, index) => {
    const title = param["display-name"] ?? param.name;

    fieldSettings[param.id] = getDefaultFieldSettings({
      id: param.id,
      name: param.name,
      title,
      placeholder: title,
      required: !!param.required,
      order: index,
      description: "",
      fieldType: getFieldType(param),
      inputType: getInputType(param),
    });
  });

  return fieldSettings;
};

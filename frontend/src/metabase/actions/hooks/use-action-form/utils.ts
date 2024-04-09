import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import type { FieldSettings as LocalFieldSettings } from "metabase/actions/types";
import { getDefaultFieldSettings } from "metabase/actions/utils";
import { isEmpty } from "metabase/lib/validate";
import Field from "metabase-lib/v1/metadata/Field";
import { TYPE } from "metabase-lib/v1/types/constants";
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

const isNumericParameter = (param: Parameter): boolean =>
  /integer|float/gi.test(param.type);

const getFieldType = (param: Parameter): "number" | "string" => {
  return isNumericParameter(param) ? "number" : "string";
};

export const getInputType = (param: Parameter, field?: Field) => {
  if (!field) {
    return isNumericParameter(param) ? "number" : "string";
  }

  if (field.isFK()) {
    return field.isNumeric() ? "number" : "string";
  }
  if (field.isNumeric()) {
    return "number";
  }
  if (field.isBoolean()) {
    return "boolean";
  }
  if (field.isTime()) {
    return "time";
  }
  if (field.isDate()) {
    return field.isDateWithoutTime() ? "date" : "datetime";
  }
  if (
    field.semantic_type === TYPE.Description ||
    field.semantic_type === TYPE.Comment ||
    field.base_type === TYPE.Structured
  ) {
    return "text";
  }
  if (
    field.semantic_type === TYPE.Title ||
    field.semantic_type === TYPE.Email
  ) {
    return "string";
  }
  if (field.isCategory() && field.semantic_type !== TYPE.Name) {
    return "string";
  }

  return "string";
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

    fieldValues.forEach(fieldValue => {
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
    const field = new Field({
      id: param.id,
      name: param.id,
      slug: param.id,
      display_name: param["display-name"],
      base_type: param.type,
      semantic_type: param.type,
    });

    fieldSettings[param.id] = getDefaultFieldSettings({
      id: param.id,
      name: param.name,
      title: field.displayName(),
      placeholder: field.displayName(),
      required: !!param.required,
      order: index,
      description: "",
      fieldType: getFieldType(param),
      inputType: getInputType(param, field),
    });
  });

  return fieldSettings;
};

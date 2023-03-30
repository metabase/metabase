import moment from "moment-timezone";

import { slugify, humanize } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";

import { getDefaultFieldSettings } from "metabase/actions/utils";

import type {
  FieldSettingsMap,
  InputSettingType,
  Parameter,
  ParameterId,
  ParametersForActionExecution,
} from "metabase-types/api";
import type { FieldSettings as LocalFieldSettings } from "metabase/actions/types";

import Field from "metabase-lib/metadata/Field";
import { TYPE } from "metabase-lib/types/constants";

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

export const generateFieldSettingsFromParameters = (
  params: Parameter[],
  fields?: Field[],
) => {
  const fieldSettings: Record<ParameterId, LocalFieldSettings> = {};

  const fieldMetadataMap = Object.fromEntries(
    fields?.map(f => [slugify(f.name), f]) ?? [],
  );

  params.forEach((param, index) => {
    const field = fieldMetadataMap[param.id]
      ? new Field(fieldMetadataMap[param.id])
      : new Field({
          id: param.id,
          name: param.id,
          slug: param.id,
          display_name: humanize(param.id),
          base_type: param.type,
          semantic_type: param.type,
        });

    const name = param["display-name"] ?? param.name ?? param.id;
    const displayName = field?.displayName?.() ?? name;

    fieldSettings[param.id] = getDefaultFieldSettings({
      id: param.id,
      name,
      title: displayName,
      placeholder: displayName,
      required: !!param?.required,
      order: index,
      description: field?.description ?? "",
      fieldType: getFieldType(param),
      inputType: getInputType(param, field),
    });
  });
  return fieldSettings;
};

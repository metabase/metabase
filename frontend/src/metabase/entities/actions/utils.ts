import _ from "underscore";
import type {
  ActionFormSettings,
  FieldType,
  InputType,
  ParameterType,
} from "metabase-types/api";
import type { Parameter as ParameterObject } from "metabase-types/types/Parameter";

import {
  fieldTypeToParameterTypeMap,
  dateTypetoParameterTypeMap,
} from "./constants";

export const removeOrphanSettings = (
  settings: ActionFormSettings,
  parameters: ParameterObject[],
): ActionFormSettings => {
  const parameterIds = parameters.map(p => p.id);
  const fieldIds = Object.keys(settings.fields);
  const orphanIds = _.difference(fieldIds, parameterIds);

  return {
    ...settings,
    fields: _.omit(settings.fields, orphanIds),
  };
};

const getParameterTypeFromFieldSettings = (
  fieldType: FieldType,
  inputType: InputType,
): ParameterType => {
  if (fieldType === "date") {
    return dateTypetoParameterTypeMap[inputType] ?? "date/single";
  }

  return fieldTypeToParameterTypeMap[fieldType] ?? "string/=";
};

export const setParameterTypesFromFieldSettings = (
  settings: ActionFormSettings,
  parameters: ParameterObject[],
): ParameterObject[] => {
  const fields = settings.fields;
  return parameters.map(parameter => {
    const field = fields[parameter.id];
    return {
      ...parameter,
      type: field
        ? getParameterTypeFromFieldSettings(field.fieldType, field.inputType)
        : "string/=",
    };
  });
};

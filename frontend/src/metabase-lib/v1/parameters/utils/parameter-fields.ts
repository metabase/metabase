import * as Lib from "metabase-lib";
import type {
  FieldFilterUiParameter,
  UiParameter,
} from "metabase-lib/v1/parameters/types";
import type { ParameterFieldInfo } from "metabase-types/api";

export const isFieldFilterUiParameter = (
  parameter: UiParameter,
): parameter is FieldFilterUiParameter => {
  return "fields" in parameter && Array.isArray(parameter.fields);
};

export const hasFields = (parameter: UiParameter) => {
  return isFieldFilterUiParameter(parameter) && parameter.fields.length > 0;
};

export const getFields = (parameter: UiParameter): ParameterFieldInfo[] => {
  if (isFieldFilterUiParameter(parameter) && hasFields(parameter)) {
    return parameter.fields;
  } else {
    return [];
  }
};

export const getNonVirtualFields = (parameter: UiParameter) => {
  return getFields(parameter).filter((field) => typeof field.id === "number");
};

export const getFieldTypeInfo = (field: ParameterFieldInfo) => {
  return Lib.legacyColumnTypeInfo(field);
};

export const hasRemappedFields = (fields: ParameterFieldInfo[]) => {
  return fields.length > 0 && fields.every((field) => field.has_remapping);
};

export const isSearchableField = (field: ParameterFieldInfo) => {
  return field.has_remapping || Lib.isString(getFieldTypeInfo(field));
};

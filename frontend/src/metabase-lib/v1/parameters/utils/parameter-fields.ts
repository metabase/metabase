import * as Lib from "metabase-lib";
import type {
  FieldFilterUiParameter,
  UiParameter,
} from "metabase-lib/v1/parameters/types";
import type { ParameterField, ParameterNameField } from "metabase-types/api";

export const isFieldFilterUiParameter = (
  parameter: UiParameter,
): parameter is FieldFilterUiParameter => {
  return "fields" in parameter && Array.isArray(parameter.fields);
};

export const hasFields = (parameter: UiParameter) => {
  return isFieldFilterUiParameter(parameter) && parameter.fields.length > 0;
};

export const getFields = (parameter: UiParameter): ParameterField[] => {
  if (isFieldFilterUiParameter(parameter) && hasFields(parameter)) {
    return parameter.fields;
  } else {
    return [];
  }
};

export const getNonVirtualFields = (parameter: UiParameter) => {
  return getFields(parameter).filter((field) => typeof field.id === "number");
};

export const getFieldTypeInfo = (field: ParameterNameField) => {
  return Lib.legacyColumnTypeInfo(field);
};

export const isSearchableField = (field: ParameterNameField) => {
  return Lib.isString(getFieldTypeInfo(field));
};

export const getExternalRemappedField = (
  field: ParameterField,
): ParameterNameField | null => {
  const [dimension] = field.dimensions ?? [];
  if (dimension?.type === "external") {
    return dimension.human_readable_field ?? null;
  }
  return (field.target ?? field).name_field ?? null;
};

export const getRemappedField = (
  field: ParameterField,
): ParameterNameField | null => {
  const [dimension] = field.dimensions ?? [];
  return dimension?.type === "internal"
    ? field
    : getExternalRemappedField(field);
};

export const getSharedRemappedField = (
  fields: ParameterField[],
): ParameterNameField | null => {
  const remappedFields = fields.map(getRemappedField);
  const remappedFieldIds = new Set(remappedFields.map((field) => field?.id));
  const [firstRemappedField] = remappedFields;
  return firstRemappedField != null && remappedFieldIds.size === 1
    ? firstRemappedField
    : null;
};

export const getSearchField = (
  field: ParameterField,
): ParameterNameField | null => {
  const remappedField = getExternalRemappedField(field);
  if (remappedField != null && isSearchableField(remappedField)) {
    return remappedField;
  }
  return isSearchableField(field) ? field : null;
};

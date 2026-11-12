import * as Lib from "metabase-lib";
import type {
  FieldFilterUiParameter,
  UiParameter,
} from "metabase-lib/v1/parameters/types";
import type { Field } from "metabase-types/api";

export const isFieldFilterUiParameter = (
  parameter: UiParameter,
): parameter is FieldFilterUiParameter => {
  return "fields" in parameter && Array.isArray(parameter.fields);
};

export const hasFields = (parameter: UiParameter) => {
  return isFieldFilterUiParameter(parameter) && parameter.fields.length > 0;
};

export const getFields = (parameter: UiParameter): Lib.ParameterFieldInfo[] => {
  if (isFieldFilterUiParameter(parameter) && hasFields(parameter)) {
    return parameter.fields;
  } else {
    return [];
  }
};

export const getNonVirtualFields = (parameter: UiParameter) => {
  return getFields(parameter).filter((field) => typeof field.id === "number");
};

const isSearchableField = (field: Field) =>
  Lib.isStringOrStringLike(Lib.legacyColumnTypeInfo(field));

const getExternalRemappedField = (field: Field): Field | null => {
  const [dimension] = field.dimensions ?? [];
  if (dimension?.type === "external") {
    return dimension.human_readable_field ?? null;
  }
  return (field.target ?? field).name_field ?? null;
};

const getSearchField = (field: Field): Field | null => {
  const remappedField = getExternalRemappedField(field);
  if (remappedField != null && isSearchableField(remappedField)) {
    return remappedField;
  }
  return isSearchableField(field) ? field : null;
};

export const getParameterFieldInfo = (field: Field): Lib.ParameterFieldInfo => {
  const typeInfo = Lib.legacyColumnTypeInfo(field);
  const [dimension] = field.dimensions ?? [];
  return {
    id: field.id,
    displayName: field.display_name,
    searchFieldDisplayName: getSearchField(field)?.display_name ?? null,
    isString: Lib.isStringOrStringLike(typeInfo),
    isBoolean: Lib.isBoolean(typeInfo),
    isDate: Lib.isTemporal(typeInfo),
    isNumeric: Lib.isNumeric(typeInfo),
    settings: field.settings ?? null,
    hasFieldValues: field.has_field_values,
    hasRemappedValues:
      dimension?.type === "internal" || getExternalRemappedField(field) != null,
  };
};

export const hasRemappedFieldValues = (fields: Lib.ParameterFieldInfo[]) =>
  fields.length > 0 && fields.every((field) => field.hasRemappedValues);

export const canSearchField = (field: Lib.ParameterFieldInfo) =>
  field.searchFieldDisplayName != null;

const getParameterFieldBaseType = (field: Lib.ParameterFieldInfo) => {
  if (field.isNumeric) {
    return "type/Number";
  }
  if (field.isBoolean) {
    return "type/Boolean";
  }
  if (field.isDate) {
    return "type/Temporal";
  }
  return "type/Text";
};

export const getParameterFieldFormatColumn = (
  field: Lib.ParameterFieldInfo,
) => ({
  base_type: getParameterFieldBaseType(field),
  settings: field.settings ?? undefined,
});

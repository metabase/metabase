import {
  Dataset,
  FieldValue,
  Parameter,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import Field from "metabase-lib/metadata/Field";
import { ParameterWithTemplateTagTarget } from "../types";
import { getFields } from "./parameter-fields";
import { getParameterSubType, getParameterType } from "./parameter-type";

export const getQueryType = (
  parameter: ParameterWithTemplateTagTarget,
): ValuesQueryType => {
  if (parameter.hasVariableTemplateTagTarget) {
    return parameter.values_query_type ?? "none";
  } else {
    return parameter.values_query_type ?? "list";
  }
};

export const getSourceType = (parameter: Parameter): ValuesSourceType => {
  return parameter.values_source_type ?? null;
};

export const getSourceConfig = (parameter: Parameter): ValuesSourceConfig => {
  return parameter.values_source_config ?? {};
};

export const canUseCustomSource = (parameter: Parameter) => {
  const type = getParameterType(parameter);
  const subType = getParameterSubType(parameter);

  switch (type) {
    case "string":
    case "location":
      return subType === "=";
    case "category":
      return true;
    default:
      return false;
  }
};

export const isValidSourceConfig = (
  sourceType: ValuesSourceType,
  { card_id, value_field, values }: ValuesSourceConfig,
) => {
  switch (sourceType) {
    case "card":
      return card_id != null && value_field != null;
    case "static-list":
      return values != null && values.length > 0;
    default:
      return true;
  }
};

export const getSourceConfigForType = (
  sourceType: ValuesSourceType,
  { card_id, value_field, values }: ValuesSourceConfig,
): ValuesSourceConfig => {
  switch (sourceType) {
    case "card":
      return { card_id, value_field };
    case "static-list":
      return { values };
    default:
      return {};
  }
};

export const canListParameterValues = (parameter: Parameter) => {
  const queryType = getQueryType(parameter);
  const sourceType = getSourceType(parameter);
  const fields = getFields(parameter);
  const canListFields = canListFieldValues(fields);

  return queryType === "list" && (sourceType != null || canListFields);
};

export const canListFieldValues = (fields: Field[]) => {
  const hasFields = fields.length > 0;
  const hasFieldValues = fields
    .filter(field => !field.isVirtual())
    .every(field => field.has_field_values === "list");

  return hasFields && hasFieldValues;
};

export const canSearchParameterValues = (
  parameter: Parameter,
  disablePKRemapping = false,
) => {
  const queryType = getQueryType(parameter);
  const sourceType = getSourceType(parameter);
  const fields = getFields(parameter);
  const canSearchFields = canSearchFieldValues(fields, disablePKRemapping);

  return queryType !== "none" && (sourceType != null || canSearchFields);
};

export const canSearchFieldValues = (
  fields: Field[],
  disablePKRemapping = false,
) => {
  const hasFields = fields.length > 0;
  const canSearch = fields.every(field =>
    field.searchField(disablePKRemapping),
  );
  const hasFieldValues = fields.some(
    field =>
      field.has_field_values === "search" ||
      (field.has_field_values === "list" && field.has_more_values === true),
  );

  return hasFields && canSearch && hasFieldValues;
};

const getUniqueNonNullValues = (values: unknown[]) => {
  return Array.from(new Set(values))
    .filter(value => value != null)
    .map(value => String(value));
};

export const getFieldSourceValues = (fieldsValues: FieldValue[][]) => {
  const allValues = fieldsValues.flatMap(values => values.map(([key]) => key));
  return getUniqueNonNullValues(allValues);
};

export const getCardSourceValues = (dataset: Dataset) => {
  const allValues = dataset.data.rows.map(([value]) => value);
  return getUniqueNonNullValues(allValues);
};

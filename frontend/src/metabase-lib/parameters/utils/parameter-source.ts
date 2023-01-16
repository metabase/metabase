import {
  Dataset,
  FieldValue,
  Parameter,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import { getFields } from "metabase-lib/parameters/utils/parameter-fields";
import Field from "metabase-lib/metadata/Field";

export const getQueryType = (parameter: Parameter): ValuesQueryType => {
  return parameter.values_query_type ?? "list";
};

export const getSourceType = (parameter: Parameter): ValuesSourceType => {
  return parameter.values_source_type ?? null;
};

export const getSourceConfig = (parameter: Parameter): ValuesSourceConfig => {
  return parameter.values_source_config ?? {};
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
  const fields = getFields(parameter);

  if (getQueryType(parameter) !== "list") {
    return false;
  } else if (getSourceType(parameter) != null) {
    return true;
  } else {
    return canListFieldValues(fields);
  }
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
  const fields = getFields(parameter);

  if (getQueryType(parameter) === "none") {
    return false;
  } else if (getSourceType(parameter) != null) {
    return true;
  } else {
    return canSearchFieldValues(fields, disablePKRemapping);
  }
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

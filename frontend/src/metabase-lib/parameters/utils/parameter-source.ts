import {
  Dataset,
  Parameter,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import {
  getFields,
  getNonVirtualFields,
} from "metabase-lib/parameters/utils/parameter-fields";
import Field from "metabase-lib/metadata/Field";

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

  return (
    parameter.values_query_type === "list" &&
    (parameter.values_source_type != null || canListFieldValues(fields))
  );
};

export const canListFieldValues = (fields: Field[]) => {
  return fields
    .filter(field => !field.isVirtual())
    .every(field => field.has_field_values === "list");
};

const getUniqueNonNullValues = (values: unknown[]) => {
  return Array.from(new Set(values))
    .filter(value => value != null)
    .map(value => String(value));
};

export const getFieldSourceValues = (fieldsValues: unknown[][][]) => {
  const allValues = fieldsValues.flatMap(values => values.map(([key]) => key));
  return getUniqueNonNullValues(allValues);
};

export const getCardSourceValues = (dataset: Dataset) => {
  const allValues = dataset.data.rows.map(([value]) => value);
  return getUniqueNonNullValues(allValues);
};

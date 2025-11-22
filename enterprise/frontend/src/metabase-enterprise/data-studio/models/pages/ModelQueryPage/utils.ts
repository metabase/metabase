import type { Dataset, DatasetColumn, Field } from "metabase-types/api";

import type { FieldOverrides } from "../../types";

function getFieldOverrides(field: Field): FieldOverrides {
  const {
    display_name,
    description,
    semantic_type,
    fk_target_field_id,
    visibility_type,
    settings,
  } = field;
  return {
    display_name,
    description,
    semantic_type,
    fk_target_field_id,
    visibility_type,
    settings,
  };
}

function applyFieldOverrides<T extends Field | DatasetColumn>(
  queryFields: T[],
  savedFields: Field[],
): T[] {
  const savedFieldByName = Object.fromEntries(
    savedFields.map((field) => [field.name, field]),
  );
  return queryFields.map((queryField) => {
    const savedField = savedFieldByName[queryField.name];
    return savedField == null
      ? queryField
      : { ...queryField, ...getFieldOverrides(savedField) };
  });
}

export function applyFieldOverridesInDataset(
  dataset: Dataset,
  savedMetadata: Field[],
) {
  if (dataset.data == null) {
    return dataset;
  }

  return {
    ...dataset,
    data: {
      ...dataset.data,
      cols: applyFieldOverrides(dataset.data.cols, savedMetadata),
    },
  };
}

export function applyFieldOverridesInResultMetadata(
  queryMetadata: Field[],
  savedMetadata: Field[],
) {
  return applyFieldOverrides(queryMetadata, savedMetadata);
}

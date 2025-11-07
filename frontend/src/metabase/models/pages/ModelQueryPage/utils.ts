import type { Field } from "metabase-types/api";

import type { FieldPatch } from "../../types";

function getFieldPatch(field: Field): FieldPatch {
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

export function mergeFieldMetadata(
  queryMetadata: Field[] | null,
  savedMetadata: Field[] | null,
) {
  if (queryMetadata == null || savedMetadata == null) {
    return queryMetadata;
  }

  const savedFieldByName = Object.fromEntries(
    savedMetadata.map((savedField) => [savedField.name, savedField]),
  );
  return queryMetadata.map((queryField) => {
    const savedField = savedFieldByName[queryField.name];
    return savedField == null
      ? queryField
      : { ...queryField, ...getFieldPatch(savedField) };
  });
}

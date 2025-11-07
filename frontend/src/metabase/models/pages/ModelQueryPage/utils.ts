import type { Field } from "metabase-types/api";

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

export function applyFieldOverrides(fields: Field[], overrides: Field[]) {
  const overridesByName = Object.fromEntries(
    overrides.map((field) => [field.name, field]),
  );
  return fields.map((field) => {
    const override = overridesByName[field.name];
    return override == null
      ? field
      : { ...field, ...getFieldOverrides(override) };
  });
}

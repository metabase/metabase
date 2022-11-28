import { DatabaseData, Engine } from "metabase-types/api";

export const getVisibleFields = (engine: Engine, values: DatabaseData) => {
  const fields = engine["details-fields"] ?? [];

  return fields.filter(field => {
    const rules = field["visible-if"] ?? {};

    return Object.entries(rules).every(([name, value]) =>
      Array.isArray(value)
        ? value.includes(values.details?.[name])
        : value === values.details?.[name],
    );
  });
};

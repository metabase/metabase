import * as Yup from "yup";
import * as Errors from "metabase/core/utils/errors";
import { Engine, EngineField } from "metabase-types/api";

export const getSchema = (engine: Engine | null, name: string | null) => {
  const fields = engine?.["details-fields"] ?? [];
  const entries = fields.map(field => [field.name, getFieldSchema(field)]);

  return Yup.object({
    engine: Yup.string().nullable().default(name).required(Errors.required),
    name: Yup.string().nullable().default(null).required(Errors.required),
    details: Yup.object(Object.fromEntries(entries)),
  });
};

const getFieldSchema = (field: EngineField) => {
  const schema = getFieldTypeSchema(field);
  return field.required ? schema.required(Errors.required) : schema;
};

const getFieldTypeSchema = (field: EngineField) => {
  switch (field.type) {
    case "integer":
      return Yup.number()
        .nullable()
        .default(field.default != null ? Number(field.default) : null);
    case "boolean":
    case "section":
      return Yup.boolean()
        .defined()
        .default(field.default != null ? Boolean(field.default) : false);
    default:
      return Yup.string()
        .nullable()
        .default(field.default != null ? String(field.default) : null);
  }
};

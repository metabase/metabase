import * as Yup from "yup";
import type { AnyObjectSchema } from "yup";
import * as Errors from "metabase/core/utils/errors";
import { Engine, EngineField } from "metabase-types/api";

export const getSchema = (engines: Record<string, Engine>) => {
  return Yup.object({
    engine: Yup.string().required(Errors.required),
    name: Yup.string().required(Errors.required),
    details: Object.entries(engines).reduce(
      (schema, [name, engine]) =>
        schema.when("engine", {
          is: name,
          then: schema => getDetailsSchema(engine, schema),
        }),
      Yup.object(),
    ),
  });
};

const getDetailsSchema = (engine: Engine, schema: AnyObjectSchema) => {
  const fields = engine["details-fields"] ?? [];
  const entries = fields.map(field => [field.name, getFieldSchema(field)]);

  return schema.shape(Object.fromEntries(entries));
};

const getFieldSchema = (field: EngineField) => {
  const schema = getFieldTypeSchema(field).nullable();
  return field.required ? schema.required(Errors.required) : schema;
};

const getFieldTypeSchema = (field: EngineField) => {
  switch (field.type) {
    case "boolean":
      return Yup.boolean();
    default:
      return Yup.string();
  }
};

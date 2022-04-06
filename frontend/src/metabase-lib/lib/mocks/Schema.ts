import { createMockDatabaseInstance } from "./Database";
import Database from "../metadata/Database";
import Schema, { HydratedSchemaProperties } from "../metadata/Schema";

const DEFAULT_SCHEMA_PROPS = {
  id: "1:foo",
  name: "foo",
  database: createMockDatabaseInstance(),
} as const;

export function createMockSchemaInstance(
  schemaProps?: Partial<Schema>,
  hydratedProps?: Partial<HydratedSchemaProperties>,
): Schema {
  let database: Database = DEFAULT_SCHEMA_PROPS.database;
  if (schemaProps?.database != null) {
    database =
      typeof schemaProps.database === "number"
        ? createMockDatabaseInstance({ id: schemaProps.database })
        : schemaProps.database;
  }

  const schema = new Schema({
    ...DEFAULT_SCHEMA_PROPS,
    ...schemaProps,
    database,
  });

  return Object.assign(schema, hydratedProps);
}

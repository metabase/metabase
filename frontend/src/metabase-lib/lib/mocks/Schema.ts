import { createMockDatabaseInstance } from "./Database";
import Database from "../metadata/Database";
import Schema, { ISchema, HydratedSchemaProperties } from "../metadata/Schema";
import Metadata from "../metadata/Metadata";

const databaseInstance = createMockDatabaseInstance();
const metadataInstance = new Metadata({
  databases: {
    [databaseInstance.id]: databaseInstance,
  },
});
const DEFAULT_SCHEMA_PROPS = {
  id: "1:foo",
  name: "foo",
  database: databaseInstance.id,
} as const;

export function createMockSchemaInstance(
  schemaProps?: Partial<ISchema>,
  hydratedProps?: Partial<HydratedSchemaProperties>,
): Schema {
  let database: Database;
  if (schemaProps?.database != null) {
    database = createMockDatabaseInstance({ id: schemaProps.database });
  } else {
    database = createMockDatabaseInstance();
  }

  const schema = new Schema({
    ...DEFAULT_SCHEMA_PROPS,
    ...schemaProps,
  });

  schema.metadata = new Metadata({
    databases: {
      [database.id]: database,
    },
  });
  schema.database = database;

  return Object.assign(schema, hydratedProps);
}

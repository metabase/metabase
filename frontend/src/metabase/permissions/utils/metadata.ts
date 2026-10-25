import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type {
  DatabaseId,
  PermissionsDatabase,
  SchemaName,
  Table,
} from "metabase-types/api";

/**
 * The permissions tree treats schemas as entities, but a database from the API
 * carries a flat table list. These group it back up.
 */
export type PermissionsSchema = {
  id: string;
  databaseId: DatabaseId;
  name: SchemaName;
  tables: Table[];
};

export const getDatabaseSchemas = (
  database: PermissionsDatabase,
): PermissionsSchema[] => {
  const schemasByName = new Map<SchemaName, PermissionsSchema>();

  for (const table of database.tables ?? []) {
    const name = table.schema ?? "";
    const schema = schemasByName.get(name) ?? {
      id: generateSchemaId(database.id, name),
      databaseId: database.id,
      name,
      tables: [],
    };
    schema.tables.push(table);
    schemasByName.set(name, schema);
  }

  return [...schemasByName.values()];
};

export const getDatabaseSchema = (
  database: PermissionsDatabase,
  schemaName: SchemaName | undefined,
): PermissionsSchema | undefined =>
  getDatabaseSchemas(database).find(
    (schema) => schema.name === (schemaName ?? ""),
  );

export const getDatabaseSchemaNames = (
  database: PermissionsDatabase,
): SchemaName[] => getDatabaseSchemas(database).map((schema) => schema.name);

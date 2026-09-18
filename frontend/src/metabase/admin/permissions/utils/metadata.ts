import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type {
  ConcreteTableId,
  DatabaseId,
  PermissionsDatabase,
  SchemaName,
  Table,
  TableEntityId,
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

export const tableToTableEntityId = (table: Table) => ({
  databaseId: table.db_id,
  schemaName: table.schema ?? "",
  // A permission entity always names a real warehouse table, never a card.
  tableId: table.id as ConcreteTableId,
});

/**
 * Whether a table sits under an entity id. An unset field on the entity id
 * matches any table, so a database id alone matches all of its tables.
 * A table with no schema reports it as either null or "", so both sides
 * are normalised before comparing.
 */
export const isTableUnderEntityId = (
  table: Table,
  entityId: Partial<TableEntityId>,
) =>
  (entityId.databaseId == null || table.db_id === entityId.databaseId) &&
  (entityId.schemaName === undefined ||
    (table.schema ?? "") === (entityId.schemaName ?? "")) &&
  (entityId.tableId == null || table.id === entityId.tableId);

import type { Database, Table } from "metabase-types/api";

/**
 * Utility functions for working with database metadata from raw API types.
 * These replace metabase-lib methods for use with RTK Query data.
 */

/**
 * Interface matching what permission functions expect from a database.
 * This allows us to use raw API types where metabase-lib Database was used.
 */
export type DatabasePermissionInfo = {
  schemas?: SchemaPermissionInfo[];
  schema(schemaName: string | undefined): SchemaPermissionInfo | null;
  getTables(): TablePermissionInfo[];
};

export type SchemaPermissionInfo = {
  name: string;
  getTables(): TablePermissionInfo[];
};

export type TablePermissionInfo = {
  id: number | string;
  db_id: number;
  schema_name?: string | null;
};

export type SchemaInfo = {
  name: string;
  tables: Table[];
};

/**
 * Group tables by schema name, returning a map of schema name to tables.
 */
export function groupTablesBySchema(tables: Table[]): Map<string, Table[]> {
  const schemaMap = new Map<string, Table[]>();

  for (const table of tables) {
    const schemaName = table.schema ?? "";
    if (!schemaMap.has(schemaName)) {
      schemaMap.set(schemaName, []);
    }
    schemaMap.get(schemaName)!.push(table);
  }

  return schemaMap;
}

/**
 * Get all schemas for a database, sorted alphabetically.
 */
export function getSchemas(database: Database): SchemaInfo[] {
  const tables = database.tables ?? [];
  const schemaMap = groupTablesBySchema(tables);

  return Array.from(schemaMap.entries())
    .map(([name, tables]) => ({
      name,
      tables: tables.sort((a, b) =>
        (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get tables for a specific schema in a database.
 */
export function getTablesForSchema(
  database: Database,
  schemaName: string,
): Table[] {
  const tables = database.tables ?? [];
  return tables
    .filter((t) => (t.schema ?? "") === schemaName)
    .sort((a, b) =>
      (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name),
    );
}

/**
 * Get a specific schema from a database.
 */
export function getSchema(
  database: Database,
  schemaName: string,
): SchemaInfo | null {
  const schemas = getSchemas(database);
  return schemas.find((s) => s.name === schemaName) ?? null;
}

/**
 * Check if database has only a single schema.
 */
export function hasSingleSchema(database: Database): boolean {
  const schemas = getSchemas(database);
  return schemas.length === 1;
}

/**
 * Get the single schema if database has only one, otherwise null.
 */
export function getSingleSchema(database: Database): SchemaInfo | null {
  const schemas = getSchemas(database);
  return schemas.length === 1 ? schemas[0] : null;
}

/**
 * Check if database has database routing enabled.
 */
export function hasDatabaseRouting(database: Database): boolean {
  return database.features?.includes("database-routing") ?? false;
}

/**
 * Get a table by ID from a database.
 */
export function getTable(database: Database, tableId: number): Table | null {
  return database.tables?.find((t) => t.id === tableId) ?? null;
}

/**
 * Get the schema count for a database.
 */
export function getSchemaCount(database: Database): number {
  return getSchemas(database).length;
}

/**
 * Convert a raw API Database to the DatabasePermissionInfo interface
 * required by permission builder functions.
 */
export function toDatabasePermissionInfo(
  database: Database,
): DatabasePermissionInfo {
  const tables = database.tables ?? [];
  const schemaMap = groupTablesBySchema(tables);

  const schemaInfos: SchemaPermissionInfo[] = Array.from(
    schemaMap.entries(),
  ).map(([name, schemaTables]) => ({
    name,
    getTables: () =>
      schemaTables.map((t) => ({
        id: t.id,
        db_id: database.id,
        schema_name: t.schema ?? null,
      })),
  }));

  return {
    schemas: schemaInfos,
    schema(schemaName: string | undefined): SchemaPermissionInfo | null {
      return schemaInfos.find((s) => s.name === (schemaName ?? "")) ?? null;
    },
    getTables(): TablePermissionInfo[] {
      return tables.map((t) => ({
        id: t.id,
        db_id: database.id,
        schema_name: t.schema ?? null,
      }));
    },
  };
}

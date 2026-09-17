import {
  skipToken,
  useGetDatabaseMetadataQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import type { DatabaseId, TableId } from "metabase-types/api";

/**
 * The database a reference page names itself after, along with the tables it
 * lists. Fields are left out: only the field pages need them, and they ask for
 * the one table they show.
 */
export function useReferenceDatabase(databaseId: DatabaseId) {
  const {
    data: database,
    isLoading,
    error,
  } = useGetDatabaseMetadataQuery(
    Number.isFinite(databaseId)
      ? { id: databaseId, skip_fields: true }
      : skipToken,
  );

  return { database, tables: database?.tables ?? [], isLoading, error };
}

/**
 * A table named by the route, taken from its database's table list.
 */
export function useReferenceTable(databaseId: DatabaseId, tableId: TableId) {
  const { database, tables, isLoading, error } =
    useReferenceDatabase(databaseId);

  return {
    database,
    tables,
    table: tables.find(({ id }) => id === tableId),
    isLoading,
    error,
  };
}

/**
 * A table with its fields, which the field pages read their columns from.
 */
export function useReferenceTableFields(
  databaseId: DatabaseId,
  tableId: TableId,
) {
  const { database } = useReferenceDatabase(databaseId);

  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery(
    Number.isFinite(tableId) ? { id: tableId } : skipToken,
  );

  return {
    database,
    table,
    fields: table?.fields ?? [],
    isLoading,
    error,
  };
}

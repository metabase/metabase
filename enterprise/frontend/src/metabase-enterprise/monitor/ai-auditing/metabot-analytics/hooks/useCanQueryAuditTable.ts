import { useMemo } from "react";

import {
  skipToken,
  useGetDatabaseMetadataQuery,
  useListDatabaseSchemaTablesQuery,
} from "metabase/api";

import { AUDIT_DB_ID } from "../constants";

/**
 * Whether the current user can run queries on an audit database view.
 *
 * `can-read?` is not enough here: data model editing permissions alone satisfy it.
 * The `can-query` filter keeps only the tables the user can really query.
 */
export function useCanQueryAuditTable(viewName: string): boolean {
  const { data: database } = useGetDatabaseMetadataQuery({
    id: AUDIT_DB_ID,
    skip_fields: true,
  });

  const lowerName = viewName.toLowerCase();
  const schema = useMemo(
    () =>
      database?.tables?.find((table) => table.name?.toLowerCase() === lowerName)
        ?.schema,
    [database, lowerName],
  );

  const { data: queryableTables } = useListDatabaseSchemaTablesQuery(
    schema == null ? skipToken : { id: AUDIT_DB_ID, schema, "can-query": true },
  );

  return (
    queryableTables?.some((table) => table.name?.toLowerCase() === lowerName) ??
    false
  );
}

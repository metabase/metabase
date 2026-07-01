import { useEffect } from "react";
import { replace } from "react-router-redux";

import { useListDatabasesQuery, useListTablesQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { findDatabaseByName } from "metabase/common/utils/database";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/urls";
import type { DatabaseId, Table } from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api";

// Exact (case-sensitive) match within a database + schema. `schemaName` is
// absent for schema-less databases, matching tables stored with a null schema.
const findTable = (
  tables: Table[],
  dbId: DatabaseId,
  schemaName: string | undefined,
  tableName: string,
) =>
  tables.find(
    (table) =>
      table.db_id === dbId &&
      table.name === tableName &&
      (table.schema || null) === (schemaName || null),
  );

/**
 * Resolves a name-based table permalink
 * (`/browse/databases/<db>/schema/<schema>/table/<table>`, or the schema-less
 * `/browse/databases/<db>/table/<table>`) to a table, then replace-redirects to
 * its canonical `/table/:id-:slug` url. `useListTablesQuery`'s `term` narrows
 * candidates server-side; the exact match happens on the client.
 */
export const TablePermalinkRedirect = ({
  params: { dbName, schemaName, tableName },
}: {
  params: { dbName: string; schemaName?: string; tableName: string };
}) => {
  const dispatch = useDispatch();
  const { data: databasesData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery();
  const { data: tables, isLoading: isLoadingTables } = useListTablesQuery({
    term: tableName,
  });

  const database = findDatabaseByName(databasesData?.data ?? [], dbName);
  const table = database
    ? findTable(tables ?? [], database.id, schemaName, tableName)
    : undefined;
  const targetUrl =
    table && isConcreteTableId(table.id)
      ? Urls.table({ id: table.id, name: table.display_name })
      : null;

  useEffect(() => {
    if (targetUrl) {
      dispatch(replace(targetUrl));
    }
  }, [targetUrl, dispatch]);

  if (isLoadingDatabases || isLoadingTables || table) {
    return <LoadingAndErrorWrapper loading />;
  }

  return <NotFound />;
};

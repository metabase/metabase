import { useEffect, useMemo } from "react";
import { shallowEqual } from "react-redux";

import { databaseApi } from "metabase/api";
import {
  DATABASE_TABLES_QUERY,
  type RawDataRouteParams,
  getDatabaseTablesQuery,
  getDatabasesTreeSidebar,
  getPermissionsDatabases,
  getSidebarDatabases,
} from "metabase/permissions";
import { useDispatch, useSelector } from "metabase/redux";

/**
 * The databases sidebar as one expandable tree. Every database's tables are
 * fetched up front so any database can be expanded without selecting it first.
 *
 * Tables are read from the request cache rather than from
 * `databasesWithTables`, which a save or a discard clears while this page stays
 * mounted and holds its subscriptions.
 */
export function useDatabasesTreeSidebar(params: RawDataRouteParams) {
  const dispatch = useDispatch();
  const allDatabases = useSelector(getPermissionsDatabases);
  const databases = useMemo(
    () => getSidebarDatabases(allDatabases),
    [allDatabases],
  );
  const databaseIdsKey = databases.map(({ id }) => id).join(",");

  useEffect(() => {
    const subscriptions = databases.map(({ id }) =>
      dispatch(
        databaseApi.endpoints.getDatabaseMetadata.initiate({
          id,
          ...DATABASE_TABLES_QUERY,
        }),
      ),
    );
    return () => subscriptions.forEach((sub) => sub.unsubscribe());
    // Resubscribe only when the set of databases changes, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, databaseIdsKey]);

  const tablesByDatabase = useSelector(
    (state) =>
      databases.map(({ id }) => getDatabaseTablesQuery(state, id).data),
    shallowEqual,
  );

  const { databaseId, schemaName, tableId } = params;

  return useMemo(
    () =>
      getDatabasesTreeSidebar(
        databases.map((database, index) => {
          const withTables = tablesByDatabase[index];
          // The metadata response has the tables; the listed database has the
          // routing attribute the tree labels. See `mergeDatabase`.
          return withTables == null
            ? database
            : {
                ...withTables,
                router_user_attribute: database.router_user_attribute,
              };
        }),
        { databaseId, schemaName, tableId },
      ),
    [databases, tablesByDatabase, databaseId, schemaName, tableId],
  );
}

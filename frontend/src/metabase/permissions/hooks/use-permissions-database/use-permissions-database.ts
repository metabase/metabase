import { useEffect, useMemo } from "react";

import {
  skipToken,
  useGetDatabaseMetadataQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { findErrorMessage } from "metabase/api/utils/errors";
import type { DatabaseId } from "metabase-types/api";

import { DATABASE_TABLES_QUERY } from "../../constants/databases";
import { useDataPermissions } from "../../contexts/DataPermissionsContext";

import { getPermissionsDatabase, getPermissionsDatabases } from "./utils";

export function usePermissionsDatabase(databaseId: DatabaseId | undefined) {
  const { databasesWithTables, addLoadedDatabase } = useDataPermissions();
  const { data: listedDatabases, isLoading: isLoadingDatabases } =
    useListDatabasesQuery();
  const {
    currentData: databaseWithTables,
    isLoading,
    isFetching,
    error,
  } = useGetDatabaseMetadataQuery(
    databaseId != null
      ? { id: databaseId, ...DATABASE_TABLES_QUERY }
      : skipToken,
  );

  useEffect(() => {
    if (databaseWithTables != null) {
      addLoadedDatabase(databaseWithTables);
    }
  }, [databaseWithTables, addLoadedDatabase]);

  const databases = useMemo(
    () => getPermissionsDatabases(listedDatabases?.data, databasesWithTables),
    [listedDatabases, databasesWithTables],
  );

  const database = useMemo(
    () =>
      getPermissionsDatabase(
        listedDatabases?.data,
        databaseWithTables != null
          ? {
              ...databasesWithTables,
              [databaseWithTables.id]: databaseWithTables,
            }
          : databasesWithTables,
        databaseId,
      ),
    [listedDatabases, databasesWithTables, databaseWithTables, databaseId],
  );

  return {
    databases,
    database,
    isLoading: isLoading || isLoadingDatabases,
    isLoadingDatabase:
      (isFetching && databaseWithTables == null) || isLoadingDatabases,
    error: findErrorMessage(error),
  };
}

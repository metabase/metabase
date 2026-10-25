import { useMemo } from "react";

import {
  skipToken,
  useGetDatabaseMetadataQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { findErrorMessage } from "metabase/api/utils/errors";
import type { DatabaseId } from "metabase-types/api";

import { DATABASE_TABLES_QUERY } from "../../constants/databases";
import { useDataPermissions } from "../../contexts/DataPermissionsContext";

import { getPermissionsDatabase } from "./utils";

export function usePermissionsDatabase(databaseId: DatabaseId | undefined) {
  const { editedDatabases } = useDataPermissions();
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

  const database = useMemo(
    () =>
      getPermissionsDatabase(
        listedDatabases?.data,
        databaseWithTables,
        databaseId,
      ),
    [listedDatabases, databaseWithTables, databaseId],
  );

  const databases = useMemo(
    () =>
      (listedDatabases?.data ?? []).map(
        (listed) =>
          getPermissionsDatabase(
            listedDatabases?.data,
            editedDatabases.find(({ id }) => id === listed.id),
            listed.id,
          ) ?? listed,
      ),
    [listedDatabases, editedDatabases],
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

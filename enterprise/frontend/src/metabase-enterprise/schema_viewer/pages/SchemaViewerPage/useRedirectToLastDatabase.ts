import { useEffect, useMemo, useRef } from "react";
import { replace } from "react-router-redux";

import { useListDatabasesQuery } from "metabase/api";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/urls";
import type { DatabaseId } from "metabase-types/api";

type UseRedirectToLastDatabaseArgs = {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
};

/**
 * Owns the `schema_viewer.last_database` UserKeyValue:
 *
 *  - On landing without a URL `database-id`, redirects to the last opened
 *    (database, schema). Validates the saved database still exists.
 *  - Re-saves on every URL context change while a database is selected, so
 *    the next landing picks up where the user left off.
 */
export function useRedirectToLastDatabase({
  databaseId,
  schema,
}: UseRedirectToLastDatabaseArgs) {
  const dispatch = useDispatch();

  const {
    value: lastDatabase,
    setValue: setLastDatabase,
    isLoading: isLoadingLastDatabase,
  } = useUserKeyValue({
    namespace: "schema_viewer",
    key: "last_database",
  });

  const { data: databasesResponse, isLoading: isLoadingDatabases } =
    useListDatabasesQuery();
  const databases = useMemo(
    () => databasesResponse?.data?.filter((db) => !db.is_saved_questions),
    [databasesResponse],
  );

  // Redirect to last opened database only on initial load (not when user
  // clears selection).
  const hasDbSelected = databaseId != null;
  const shoudlRedirectRef = useRef(true);

  useEffect(() => {
    if (!shoudlRedirectRef.current) {
      return;
    }
    if (
      !isLoadingLastDatabase &&
      !isLoadingDatabases &&
      !hasDbSelected &&
      lastDatabase != null &&
      databases != null
    ) {
      // Validate saved database still exists before redirecting.
      const dbExists = databases.some(
        (db) => db.id === lastDatabase.databaseId,
      );
      if (dbExists) {
        shoudlRedirectRef.current = false;
        const url = Urls.dataStudioSchemaViewer({
          databaseId: lastDatabase.databaseId,
          schema: lastDatabase.schema,
        });
        dispatch(replace(url));
      }
    }
    // Mark as "redirected" even if we didn't redirect (no saved db or db
    // doesn't exist) so we don't re-redirect when the user clears selection.
    if (!isLoadingLastDatabase && !isLoadingDatabases) {
      shoudlRedirectRef.current = false;
    }
  }, [
    isLoadingLastDatabase,
    isLoadingDatabases,
    hasDbSelected,
    lastDatabase,
    databases,
    dispatch,
  ]);

  // Save current database/schema as last opened.
  useEffect(() => {
    if (databaseId != null) {
      setLastDatabase({ databaseId, schema });
    }
  }, [databaseId, schema, setLastDatabase]);
}

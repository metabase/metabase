import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { isSyncInProgress } from "metabase/lib/syncing";
import { getMetadata } from "metabase/selectors/metadata";
import { getUser } from "metabase/selectors/user";
import type Database from "metabase-lib/v1/metadata/Database";

import DatabaseStatus from "../../components/DatabaseStatus";

const POLLING_INTERVAL = 2000;

const DatabaseStatusContainer = (): JSX.Element | null => {
  const user = useSelector(getUser);
  const metadata = useSelector(getMetadata);

  // Fetch database list
  // Note: We always fetch, but we'll determine polling interval below
  const { data: databasesResponse } = useListDatabasesQuery();
  const databases = databasesResponse?.data ?? [];

  // Get metadata objects for the databases
  const databaseMetadataObjects = useMemo(
    () =>
      databases
        .map((db) => metadata.database(db.id))
        .filter((db): db is Database => db != null),
    [databases, metadata],
  );

  // Check if any database is syncing
  const hasSyncInProgress = useMemo(
    () => databaseMetadataObjects.some(isSyncInProgress),
    [databaseMetadataObjects],
  );

  // Enable polling when sync is in progress
  // This creates a second subscription that will enable polling
  // RTK Query will deduplicate the requests and update all subscribers
  useListDatabasesQuery(undefined, {
    pollingInterval: hasSyncInProgress ? POLLING_INTERVAL : 0,
  });

  return <DatabaseStatus user={user} databases={databaseMetadataObjects} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseStatusContainer;

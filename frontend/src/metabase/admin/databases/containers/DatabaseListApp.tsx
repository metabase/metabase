import { useEffect, useMemo, useState } from "react";

import {
  useAddSampleDatabaseMutation,
  useListDatabasesQuery,
} from "metabase/api";
import { LoadingAndGenericErrorWrapper } from "metabase/common/components/LoadingAndGenericErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { isSyncInProgress } from "metabase/lib/syncing";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";

import { DatabaseList } from "../components/DatabaseList";
import { getDeletes, getDeletionError } from "../selectors";

interface DatabaseListAppProps {
  children: React.ReactNode;
}

export const DatabaseListApp = (props: DatabaseListAppProps) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const deletes = useSelector(getDeletes);
  const deletionError = useSelector(getDeletionError);
  const engines = useSetting("engines");

  const [addSampleDb, addSampleDbResult] = useAddSampleDatabaseMutation();

  const [pollingInterval, setPollingInterval] = useState<number>();

  const databasesReq = useListDatabasesQuery(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.databaseDetailsQueryProps,
    { pollingInterval },
  );

  const dbs = useMemo(() => databasesReq?.data?.data ?? [], [databasesReq]);
  const isSyncing = useMemo(() => dbs.some(isSyncInProgress), [dbs]);

  useEffect(() => {
    setPollingInterval(isSyncing ? 2000 : undefined);
  }, [isSyncing]);

  return (
    <LoadingAndGenericErrorWrapper
      loading={databasesReq.isLoading}
      error={databasesReq.error}
      noWrapper
    >
      <DatabaseList
        {...props}
        databases={dbs}
        addSampleDatabase={addSampleDb}
        isAddingSampleDatabase={addSampleDbResult.isLoading}
        addSampleDatabaseError={addSampleDbResult.isError}
        engines={engines}
        deletes={deletes}
        deletionError={deletionError}
        isAdmin={isAdmin}
      />
    </LoadingAndGenericErrorWrapper>
  );
};

import { useEffect, useMemo, useState } from "react";

import { useListDatabasesQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import LoadingAndGenericErrorWrapper from "metabase/components/LoadingAndGenericErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isSyncInProgress } from "metabase/lib/syncing";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";

import { DatabaseList } from "../components/DatabaseList";
import { addSampleDatabase } from "../database";
import {
  getAddSampleDatabaseError,
  getDeletes,
  getDeletionError,
  getIsAddingSampleDatabase,
} from "../selectors";

interface DatabaseListAppProps {
  children: React.ReactNode;
}

export const DatabaseListApp = (props: DatabaseListAppProps) => {
  const dispatch = useDispatch();
  const isAdmin = useSelector(getUserIsAdmin);
  const addSampleDatabaseError = useSelector(getAddSampleDatabaseError);
  const isAddingSampleDatabase = useSelector(getIsAddingSampleDatabase);
  const deletes = useSelector(getDeletes);
  const deletionError = useSelector(getDeletionError);
  const engines = useSetting("engines");

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
        addSampleDatabase={() => dispatch(addSampleDatabase())}
        isAddingSampleDatabase={isAddingSampleDatabase}
        addSampleDatabaseError={addSampleDatabaseError}
        engines={engines}
        deletes={deletes}
        deletionError={deletionError}
        isAdmin={isAdmin}
      />
    </LoadingAndGenericErrorWrapper>
  );
};

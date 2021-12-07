import React from "react";
import { isSyncInProgress } from "metabase/lib/syncing";
import SyncSnackbarContent from "../SyncSnackbarContent";
import useListWithHideDelay from "../../hooks/use-list-with-hide-delay";
import { Database, User } from "../../types";

const HIDE_DELAY = 6000;

export interface Props {
  user: User;
  databases: Database[];
}

const SyncSnackbar = ({ user, databases }: Props) => {
  const databaseById = Object.fromEntries(databases.map(d => [d.id, d]));
  const realDatabases = databases.filter(d => !d.is_sample);
  const userDatabases = realDatabases.filter(d => d.creator_id === user.id);
  const syncDatabases = userDatabases.filter(d => isSyncInProgress(d));
  const syncDatabaseIds = syncDatabases.map(d => d.id);
  const delayedDatabaseIds = useListWithHideDelay(syncDatabaseIds, HIDE_DELAY);
  const delayedDatabases = delayedDatabaseIds.map(id => databaseById[id]);
  const shownDatabases = delayedDatabases.filter(d => d != null);

  if (shownDatabases.length) {
    return <SyncSnackbarContent databases={shownDatabases} />;
  } else {
    return null;
  }
};

export default SyncSnackbar;

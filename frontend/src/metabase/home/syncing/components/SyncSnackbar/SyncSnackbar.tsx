import React from "react";
import { isSyncInProgress } from "metabase/lib/syncing";
import SyncSnackbarContent from "../SyncSnackbarContent";
import useListWithRemoveDelay from "../../hooks/use-list-with-remove-delay";
import { Database } from "../../types";

const REMOVE_DELAY = 6000;

export interface Props {
  databases: Database[];
}

const SyncSnackbar = ({ databases }: Props) => {
  const visibleDatabases = useVisibleDatabases(databases);

  if (visibleDatabases.length) {
    return <SyncSnackbarContent databases={visibleDatabases} />;
  } else {
    return null;
  }
};

const useVisibleDatabases = (databases: Database[]) => {
  const syncingIds = databases.filter(d => isSyncInProgress(d)).map(d => d.id);
  const visibleIds = useListWithRemoveDelay(syncingIds, REMOVE_DELAY);
  const databaseById = Object.fromEntries(databases.map(d => [d.id, d]));

  return visibleIds.map(id => databaseById[id]).filter(d => d != null);
};

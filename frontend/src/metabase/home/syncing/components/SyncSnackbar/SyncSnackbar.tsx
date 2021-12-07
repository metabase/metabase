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
  const mapping = Object.fromEntries(databases.map(d => [d.id, d]));
  const syncingIds = databases.filter(d => isSyncInProgress(d)).map(d => d.id);
  const visibleIds = useListWithRemoveDelay(syncingIds, REMOVE_DELAY);
  const visible = visibleIds.map(id => mapping[id]).filter(d => d != null);

  if (visible.length) {
    return <SyncSnackbarContent databases={visible} />;
  } else {
    return null;
  }
};

export default SyncSnackbar;

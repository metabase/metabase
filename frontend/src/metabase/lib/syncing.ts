import type { InitialSyncStatus } from "metabase-types/api";

type Syncable = { initial_sync_status: InitialSyncStatus };

export const isSyncInProgress = (entity: Syncable) => {
  return entity.initial_sync_status === "incomplete";
};

export const isSyncCompleted = (entity: Syncable) => {
  return entity.initial_sync_status === "complete";
};

export const isSyncAborted = (entity: Syncable) => {
  return entity.initial_sync_status === "aborted";
};

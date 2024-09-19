import type { InitialSyncStatus } from "metabase-types/api";

export const isSyncInProgress = (entity: {
  initial_sync_status: InitialSyncStatus | null;
}) => {
  return entity.initial_sync_status === "incomplete";
};

export const isSyncCompleted = (entity: {
  initial_sync_status: InitialSyncStatus | null;
}) => {
  return entity.initial_sync_status === "complete";
};

export const isSyncAborted = (entity: {
  initial_sync_status: InitialSyncStatus | null;
}) => {
  return entity.initial_sync_status === "aborted";
};

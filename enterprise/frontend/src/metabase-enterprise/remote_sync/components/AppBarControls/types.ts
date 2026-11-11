import type { RemoteSyncTaskId } from "metabase-types/api";

export type SyncTask = {
  id: RemoteSyncTaskId;
  title: string;
};

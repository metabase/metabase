import type { State } from "metabase-types/store";

import type { SyncTaskState } from "./sync-task-slice";

export interface RemoteSyncStoreState extends State {
  plugins?: {
    remoteSyncPlugin?: SyncTaskState;
  };
}

import type { State } from "metabase/redux/store";

import type { SyncTaskState } from "./sync-task-slice";

export interface RemoteSyncStoreState extends State {
  plugins?: {
    remoteSyncPlugin?: SyncTaskState;
  };
}

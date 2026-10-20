import type { State } from "metabase/redux/store";
import type { RemoteSyncConfigurationSettings } from "metabase-types/api";

import type { SYNC_LIBRARY_PENDING_KEY } from "./constants";
import type { SyncTaskState } from "./sync-task-slice";

export interface RemoteSyncStoreState extends State {
  plugins?: {
    remoteSyncPlugin?: SyncTaskState;
  };
}

export type RemoteSyncSettingsVariant = "admin" | "settings-modal";

export type RemoteSyncSettingsFormState = RemoteSyncConfigurationSettings & {
  [Key in typeof SYNC_LIBRARY_PENDING_KEY]?: boolean;
};

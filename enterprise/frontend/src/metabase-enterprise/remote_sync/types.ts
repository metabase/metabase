import type { State } from "metabase/redux/store";
import type { RemoteSyncConfigurationSettings } from "metabase-types/api";

import type { SyncTaskState } from "./sync-task-slice";

export interface RemoteSyncStoreState extends State {
  plugins?: {
    remoteSyncPlugin?: SyncTaskState;
  };
}

export type RemoteSyncSettingsVariant = "admin" | "settings-modal";

export type RemoteSyncSettingsFormState = RemoteSyncConfigurationSettings;

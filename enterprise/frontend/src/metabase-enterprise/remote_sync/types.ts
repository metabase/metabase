import type { State } from "metabase/redux/store";
import type {
  EnterpriseSettings,
  RemoteSyncConfigurationSettings,
} from "metabase-types/api";

import type { SYNC_LIBRARY_PENDING_KEY } from "./constants";
import type { SyncTaskState } from "./sync-task-slice";

export interface RemoteSyncStoreState extends State {
  plugins?: {
    remoteSyncPlugin?: SyncTaskState;
  };
}

export type RemoteSyncSettingsVariant = "admin" | "settings-modal";

export type RemoteSyncSettingsFormState = RemoteSyncConfigurationSettings &
  Pick<EnterpriseSettings, "remote-sync-enabled"> & {
    [Key in typeof SYNC_LIBRARY_PENDING_KEY]?: boolean;
  };

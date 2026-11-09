import type { RegularCollectionId, RemoteSyncType } from "metabase-types/api";

export type SettingsFormValues = {
  "remote-sync-url": string;
  "remote-sync-token": string;
  "remote-sync-type": RemoteSyncType;
  "remote-sync-branch": string;
  "remote-sync-auto-import": boolean;
  library: boolean;
  collections: Record<RegularCollectionId, boolean>;
};

export type SyncableCollection = {
  id: RegularCollectionId;
  name: string;
  isRemoteSynced: boolean;
};

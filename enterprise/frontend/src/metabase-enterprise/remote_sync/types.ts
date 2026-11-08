import type { RemoteSyncType } from "metabase-types/api";

export type SettingsFormValues = {
  "remote-sync-url": string;
  "remote-sync-token": string;
  "remote-sync-type": RemoteSyncType;
  "remote-sync-branch": string;
  "remote-sync-auto-import": boolean;
  "remote-sync-transforms": boolean;
  collections: Record<number, boolean>;
};

export type SyncableCollection = {
  id: number;
  name: string;
  isRemoteSynced: boolean;
};

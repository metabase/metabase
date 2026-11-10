import type { RegularCollectionId, RemoteSyncType } from "metabase-types/api";

export type SettingsFormValues = {
  url: string;
  token: string;
  type: RemoteSyncType;
  branch: string;
  autoImport: boolean;
  collections: Record<RegularCollectionId, boolean>;
};

export type SyncableCollection = {
  id: RegularCollectionId;
  name: string;
  isRemoteSynced: boolean;
};

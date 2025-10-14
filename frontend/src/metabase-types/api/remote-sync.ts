import type { EnterpriseSettings } from "./settings";
import type { UserId } from "./user";
import type { CardDisplayType } from "./visualization";

export type DirtyEntityModel =
  | "card"
  | "dataset"
  | "metric"
  | "dashboard"
  | "collection"
  | "document"
  | "snippet";

export type DirtySyncStatus =
  | "create"
  | "update"
  | "delete"
  | "touch"
  | "removed";

export type DirtyEntity = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string | null;
  model: DirtyEntityModel;
  collection_id?: number;
  display?: CardDisplayType;
  query_type?: string;
  sync_status: DirtySyncStatus;
  authority_level?: string | null;
};

export type CollectionDirtyResponse = {
  dirty: DirtyEntity[];
  changedCollections: Record<number, boolean>;
};

export type CollectionIsDirtyResponse = {
  is_dirty: boolean;
};

export type ExportChangesRequest = {
  message?: string;
  branch?: string;
  forceSync?: boolean;
};

export type ExportChangesResponse = {
  message?: string;
  task_id?: number;
};

export type ImportFromBranchRequest = {
  branch: string;
  force?: boolean;
};

export type ImportFromBranchResponse = {
  status?: string;
  task_id?: number;
  message?: string;
};

export type RemoteSyncSettingsSet = Pick<
  EnterpriseSettings,
  | "remote-sync-enabled"
  | "remote-sync-url"
  | "remote-sync-token"
  | "remote-sync-type"
  | "remote-sync-branch"
>;

export type UpdateRemoteSyncSettingsRequest = RemoteSyncSettingsSet;

export type UpdateRemoteSyncSettingsResponse = {
  success: boolean;
  task_id?: number;
};

export type CurrentTaskStatus =
  | "running"
  | "successful"
  | "timed-out"
  | "cancelled"
  | "errored";

export type SyncTaskType = "import" | "export" | null;

export type CurrentTaskResponse = {
  id: number;
  sync_task_type: SyncTaskType;
  status: CurrentTaskStatus;
  progress: number | null;
  started_at: string | null;
  ended_at: string | null;
  last_progress_report_at: string | null;
  error_message: string | null;
  initiated_by: UserId;
};

export type GetBranchesResponse = {
  items: string[];
};

export type CreateBranchRequest = {
  name: string;
  baseBranch?: string;
};

export type CreateBranchResponse = {
  status: string;
  message: string;
};

export type CancelSyncTaskResponse = CurrentTaskResponse;

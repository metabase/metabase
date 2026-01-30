import type { EnterpriseSettings } from "./settings";
import type { UserId } from "./user";
import type { CardDisplayType } from "./visualization";

export type RemoteSyncEntityModel =
  | "card"
  | "dataset"
  | "metric"
  | "dashboard"
  | "collection"
  | "document"
  | "nativequerysnippet"
  | "table"
  | "field"
  | "segment"
  | "measure"
  | "transform"
  | "transformtag"
  | "transformjob"
  | "pythonlibrary";

export type RemoteSyncEntityStatus =
  | "create"
  | "update"
  | "delete"
  | "touch"
  | "removed";

export type RemoteSyncEntity = {
  id: number;
  name: string;
  model: RemoteSyncEntityModel;
  collection_id?: number;
  display?: CardDisplayType;
  sync_status: RemoteSyncEntityStatus;
  authority_level?: string | null;
  /** Parent table ID for field and segment models */
  table_id?: number;
  /** Parent table name for field and segment models */
  table_name?: string;
};

export type RemoteSyncChangesResponse = {
  dirty: RemoteSyncEntity[];
  changedCollections: Record<number, boolean>;
};

export type RemoteSyncHasChangesResponse = {
  is_dirty: boolean;
};

export type HasRemoteChangesResponse = {
  has_changes: boolean;
};

export type ExportChangesRequest = {
  message?: string;
  branch?: string;
  force?: boolean;
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

export type CollectionSyncPreferences = Record<number, boolean>;

export type RemoteSyncConfigurationSettings = Pick<
  EnterpriseSettings,
  | "remote-sync-enabled"
  | "remote-sync-url"
  | "remote-sync-token"
  | "remote-sync-type"
  | "remote-sync-branch"
  | "remote-sync-transforms"
> & {
  collections?: CollectionSyncPreferences;
};

export type UpdateRemoteSyncConfigurationResponse = {
  success: boolean;
  task_id?: number;
};

export type RemoteSyncTaskStatus =
  | "running"
  | "successful"
  | "timed-out"
  | "cancelled"
  | "errored";

export type RemoteSyncTaskType = "import" | "export" | null;

export type RemoteSyncTask = {
  id: number;
  sync_task_type: RemoteSyncTaskType;
  status: RemoteSyncTaskStatus;
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

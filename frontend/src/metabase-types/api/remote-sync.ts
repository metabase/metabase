import type { RemoteSyncType } from "./settings";
import type { UserId } from "./user";
import type { CardDisplayType } from "./visualization";

export type RemoteSyncEntityModel =
  | "action"
  | "card"
  | "collection"
  | "dashboard"
  | "dataapp"
  | "document"
  | "fieldusersettings"
  | "glossary"
  | "measure"
  | "nativequerysnippet"
  | "pythonlibrary"
  | "segment"
  | "tableusersettings"
  | "timeline"
  | "transform"
  | "transformtag"
  | "transformtest";

export type RemoteSyncEntityStatus = "create" | "update" | "delete" | "removed";

export type RemoteSyncEntity = {
  id: number;
  name: string;
  model: RemoteSyncEntityModel;
  sync_status: RemoteSyncEntityStatus;
  collection_id?: number;
  display?: CardDisplayType;
  table_id?: number;
  card_id?: number | null;
};

export type RemoteSyncChangesResponse = {
  dirty: RemoteSyncEntity[];
};

export type HasRemoteChangesResponse = {
  has_changes: boolean;
  remote_version: string | null;
  local_version: string | null;
  branch_missing?: boolean;
};

export type ExportChangesRequest = {
  branch: string;
  message?: string;
  force?: boolean;
  merge?: boolean;
};

export type ExportChangesResponse = {
  message: string;
  task_id: number;
};

export type ExportPreflightRequest = {
  branch: string;
};

export type RemoteSyncMergeSummary = {
  added: number;
  updated: number;
  removed: number;
};

export type ForcePushCasualties = {
  deleted: string[];
  overwritten: string[];
};

export type ExportPreflightResponse = {
  has_changes: boolean;
  clean: boolean;
  conflicts: string[];
  summary: RemoteSyncMergeSummary;
  force_push_casualties: ForcePushCasualties;
  reason: string | null;
};

export type ImportChangesRequest = {
  branch?: string;
  force?: boolean;
  merge?: boolean;
  expected_branch?: string;
};

export type ImportChangesResponse = {
  status: "success";
  task_id: number | null;
  message?: string | null;
};

export type StashChangesRequest = {
  new_branch: string;
  message: string;
};

export type StashChangesResponse = {
  status: string;
  message: string;
  task_id: number;
};

export type UpdateRemoteSyncSettingsRequest = {
  "remote-sync-url"?: string | null;
  "remote-sync-token"?: string | null;
  "remote-sync-type"?: RemoteSyncType | null;
  "remote-sync-branch"?: string | null;
  "remote-sync-auto-import"?: boolean | null;
  "remote-sync-transforms"?: boolean | null;
  collections?: Record<number, boolean> | null;
};

export type UpdateRemoteSyncSettingsResponse = {
  success: boolean;
  task_id?: number;
};

export type RemoteSyncTaskStatus =
  | "running"
  | "successful"
  | "errored"
  | "cancelled"
  | "timed-out"
  | "conflict";

export type RemoteSyncTaskType = "import" | "export";

export type RemoteSyncOutcome =
  | { kind: "pulled"; count: number; branch: string | null }
  | { kind: "pull-skipped" }
  | { kind: "pushed"; count: number; branch: string | null }
  | { kind: "push-skipped" }
  | { kind: "remote-changed" };

export type RemoteSyncTaskUser = {
  id: UserId;
  first_name: string | null;
  last_name: string | null;
  email: string;
};

export type RemoteSyncTask = {
  id: number;
  sync_task_type: RemoteSyncTaskType;
  status: RemoteSyncTaskStatus;
  progress: number | null;
  started_at: string;
  ended_at?: string | null;
  error_message?: string | null;
  outcome?: RemoteSyncOutcome | null;
  conflicts?: string[] | null;
  initiated_by_user?: RemoteSyncTaskUser | null;
};

export type GetBranchesResponse = {
  items: string[];
};

export type CreateBranchRequest = {
  name: string;
};

export type CreateBranchResponse = {
  status: string;
  message: string;
};

export type TestRemoteSyncConnectionRequest = {
  "remote-sync-url"?: string | null;
  "remote-sync-token"?: string | null;
};

export type TestRemoteSyncConnectionResponse = {
  status: "success";
};

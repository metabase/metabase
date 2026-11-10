import type {
  CollectionId,
  CollectionType,
  RegularCollectionId,
} from "./collection";
import type { RemoteSyncType } from "./settings";
import type { UserId } from "./user";

export type RemoteSyncTaskId = number;

export type RemoteSyncEntityId = number;

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

export type RemoteSyncEntityCollectionAncestor = {
  id: CollectionId;
  name: string;
  type: CollectionType | null;
  personal_owner_id: UserId | null;
};

export type RemoteSyncEntityCollection = {
  id: CollectionId;
  name: string;
  type: CollectionType | null;
  effective_ancestors: RemoteSyncEntityCollectionAncestor[];
};

export type RemoteSyncEntityParentModel = Extract<
  RemoteSyncEntityModel,
  "card" | "tableusersettings" | "transform"
>;

export type RemoteSyncEntityParent = {
  model: RemoteSyncEntityParentModel;
  id: number;
  name: string | null;
};

export type RemoteSyncEntity = {
  id: RemoteSyncEntityId;
  name: string;
  model: RemoteSyncEntityModel;
  sync_status: RemoteSyncEntityStatus;
  collection?: RemoteSyncEntityCollection;
  parent?: RemoteSyncEntityParent;
};

export type RemoteSyncEntityRef = {
  id: RemoteSyncEntityId;
  name: string;
  model: RemoteSyncEntityModel;
};

export type RemoteSyncUnsyncedDependency = {
  id: RemoteSyncEntityId;
  name: string;
  model: RemoteSyncEntityModel;
  collection?: RemoteSyncEntityCollection;
  used_by: RemoteSyncEntityRef[];
};

export type RemoteSyncUnsyncedDependenciesErrorData = {
  message: string;
  "error-code": "unsynced-dependencies";
  unsynced_dependencies: RemoteSyncUnsyncedDependency[];
};

export type RemoteSyncUnsyncedDependenciesError = {
  data: RemoteSyncUnsyncedDependenciesErrorData;
};

export type RemoteSyncChangesResponse = {
  dirty: RemoteSyncEntity[];
};

export type RemoteSyncIsDirtyResponse = {
  is_dirty: boolean;
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
  task_id: RemoteSyncTaskId;
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
  task_id: RemoteSyncTaskId | null;
  message?: string | null;
};

export type StashChangesRequest = {
  new_branch: string;
  message: string;
};

export type StashChangesResponse = {
  status: string;
  message: string;
  task_id: RemoteSyncTaskId;
};

export type UpdateRemoteSyncSettingsRequest = {
  "remote-sync-url"?: string | null;
  "remote-sync-token"?: string | null;
  "remote-sync-type"?: RemoteSyncType | null;
  "remote-sync-branch"?: string | null;
  "remote-sync-auto-import"?: boolean | null;
  collections?: Record<RegularCollectionId, boolean> | null;
};

export type UpdateRemoteSyncSettingsResponse = {
  success: boolean;
  task_id?: RemoteSyncTaskId;
};

export type RemoteSyncTaskStatus =
  | "running"
  | "successful"
  | "errored"
  | "cancelled"
  | "timed-out"
  | "conflict";

export type RemoteSyncTaskType = "import" | "export";

export type RemoteSyncPulledOutcome = {
  kind: "pulled";
  count: number;
  branch: string | null;
};

export type RemoteSyncPullSkippedOutcome = {
  kind: "pull-skipped";
};

export type RemoteSyncPushedOutcome = {
  kind: "pushed";
  count: number;
  branch: string | null;
};

export type RemoteSyncPushSkippedOutcome = {
  kind: "push-skipped";
};

export type RemoteSyncRemoteChangedOutcome = {
  kind: "remote-changed";
};

export type RemoteSyncOutcome =
  | RemoteSyncPulledOutcome
  | RemoteSyncPullSkippedOutcome
  | RemoteSyncPushedOutcome
  | RemoteSyncPushSkippedOutcome
  | RemoteSyncRemoteChangedOutcome;

export type RemoteSyncTaskUser = {
  id: UserId;
  first_name: string | null;
  last_name: string | null;
  email: string;
};

export type RemoteSyncTask = {
  id: RemoteSyncTaskId;
  sync_task_type: RemoteSyncTaskType;
  status: RemoteSyncTaskStatus;
  progress: number | null;
  started_at: string;
  ended_at?: string | null;
  last_progress_report_at?: string | null;
  last_heartbeat_at?: string | null;
  error_message?: string | null;
  outcome?: RemoteSyncOutcome | null;
  conflicts?: string[] | null;
  initiated_by_user?: RemoteSyncTaskUser | null;
};

export type GetBranchesResponse = {
  items: string[];
};

export type TestRemoteSyncConnectionRequest = {
  "remote-sync-url"?: string | null;
  "remote-sync-token"?: string | null;
};

export type TestRemoteSyncConnectionResponse = {
  status: "success";
};

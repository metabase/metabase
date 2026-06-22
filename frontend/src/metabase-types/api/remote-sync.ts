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
  /** Perform a 3-way merge when the remote branch has advanced (instead of refusing). */
  merge?: boolean;
};

export type ExportChangesResponse = {
  message?: string;
  task_id?: number;
};

/** Counts of remote changes a merge would fold into local content. */
export type RemoteSyncMergeSummary = {
  added: number;
  updated: number;
  removed: number;
};

/** Remote content a force push would discard (vs. a merge, which folds it in). */
export type ForcePushCasualties = {
  /** Entities present on the remote but not in this instance's export — removed entirely. */
  deleted: string[];
  /** Entities whose remote-side edits since the last sync would be replaced by this instance's version. */
  overwritten: string[];
};

/** Dry-run preview of what pushing the current state would do, given the live remote branch. */
export type ExportPreflightResponse = {
  /** Whether the remote branch has advanced beyond the last synced version. */
  has_changes: boolean;
  /** Whether a 3-way merge would apply with no conflicts. */
  clean: boolean;
  /** Human-readable labels of the entities that conflict (empty when clean). */
  conflicts: string[];
  summary: RemoteSyncMergeSummary;
  /** Remote content a force push would permanently discard. */
  force_push_casualties: ForcePushCasualties;
  /** "history-rewritten" when the remote was force-pushed/rebased so no merge base exists. */
  reason: string | null;
};

export type ImportFromBranchRequest = {
  branch: string;
  force?: boolean;
  /** Perform a local-only 3-way merge, keeping un-pushed local changes instead of overwriting them. */
  merge?: boolean;
  /**
   * The branch the client believes is currently active. Rejected (409) if it disagrees with the
   * configured remote-sync-branch — i.e. another session switched branches. Differs from `branch`
   * on a branch switch, where `branch` is the target and this is the branch being switched away from.
   */
  expected_branch: string;
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
  | "remote-sync-auto-import"
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
  | "conflict"
  | "errored";

export type RemoteSyncTaskType = "import" | "export" | null;

/**
 * Structured result of a completed sync task. The UI renders it to a localized message; unrecognized
 * shapes fall back to generic copy, so this union can grow without breaking older/newer clients.
 */
export type RemoteSyncOutcome =
  | { kind: "pulled"; count: number; branch: string }
  | { kind: "pull-skipped" }
  | { kind: "pushed"; count: number; branch: string }
  | { kind: "push-skipped" }
  | { kind: "merged"; pulled: number; pushed: number; branch: string };

export type RemoteSyncTask = {
  id: number;
  sync_task_type: RemoteSyncTaskType;
  status: RemoteSyncTaskStatus;
  progress: number | null;
  started_at: string | null;
  ended_at: string | null;
  last_progress_report_at: string | null;
  error_message: string | null;
  outcome?: RemoteSyncOutcome | null;
  initiated_by: UserId;
  conflicts?: string[];
};

export type RemoteSyncConflictVariant =
  | "push" // Conflict when pushing (need to pull from remote first)
  | "pull" // Conflict when pulling (need to sync local changes)
  | "switch-branch" // Conflict when switching branches
  | "setup"; // Conflict when setting up or pulling for the first time

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

export type TestRemoteSyncConnectionRequest = {
  "remote-sync-url"?: string | null;
  "remote-sync-token"?: string | null;
};

export type TestRemoteSyncConnectionResponse = {
  status: "success";
};

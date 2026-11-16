import type { WritebackAction } from "./actions";
import type { Card } from "./card";
import type { Collection, RegularCollectionId } from "./collection";
import type { Dashboard } from "./dashboard";
import type { DataApp } from "./data-app";
import type { CardTest, TransformTest } from "./data-test";
import type { Document } from "./document";
import type { FieldDimension, FieldUserSettings } from "./field";
import type { GlossaryItem } from "./glossary";
import type { Measure } from "./measure";
import type { Segment } from "./segment";
import type { RemoteSyncType } from "./settings";
import type { NativeQuerySnippet } from "./snippets";
import type { TableUserSettings } from "./table";
import type { Timeline } from "./timeline";
import type { PythonLibrary, Transform, TransformTag } from "./transform";
import type { UserId } from "./user";

export type RemoteSyncTaskId = number;

export type RemoteSyncItemId = number;

export type RemoteSyncActionData = Pick<
  WritebackAction,
  "id" | "name" | "type" | "model_id" | "collection_id" | "model" | "collection"
>;

export type RemoteSyncCardData = Pick<
  Card,
  "id" | "name" | "collection_id" | "collection"
>;

export type RemoteSyncCardTestData = Pick<
  CardTest,
  "id" | "name" | "card_id" | "card"
>;

export type RemoteSyncCollectionData = Pick<
  Collection,
  "id" | "name" | "type" | "location" | "effective_ancestors"
>;

export type RemoteSyncDashboardData = Pick<
  Dashboard,
  "id" | "name" | "collection_id" | "collection"
>;

export type RemoteSyncDataAppData = Pick<DataApp, "id" | "slug" | "name">;

export type RemoteSyncDimensionData = Pick<
  FieldDimension,
  "id" | "field_id" | "name" | "field"
>;

export type RemoteSyncDocumentData = Pick<
  Document,
  "id" | "name" | "collection_id" | "collection"
>;

export type RemoteSyncFieldUserSettingsData = Pick<
  FieldUserSettings,
  "field_id" | "display_name" | "field"
>;

export type RemoteSyncGlossaryData = Pick<GlossaryItem, "id" | "term">;

export type RemoteSyncMeasureData = Pick<
  Measure,
  "id" | "name" | "table_id" | "table"
>;

export type RemoteSyncNativeQuerySnippetData = Pick<
  NativeQuerySnippet,
  "id" | "name" | "collection_id" | "collection"
>;

export type RemoteSyncPythonLibraryData = Pick<PythonLibrary, "path"> & {
  id: RemoteSyncItemId;
};

export type RemoteSyncSegmentData = Pick<
  Segment,
  "id" | "name" | "table_id" | "table"
>;

export type RemoteSyncTableUserSettingsData = Pick<
  TableUserSettings,
  "table_id" | "display_name" | "collection_id" | "table" | "collection"
>;

export type RemoteSyncTimelineData = Pick<
  Timeline,
  "id" | "name" | "collection_id" | "collection"
>;

export type RemoteSyncTransformData = Pick<
  Transform,
  "id" | "name" | "collection_id" | "collection"
>;

export type RemoteSyncTransformTagData = Pick<TransformTag, "id" | "name">;

export type RemoteSyncTransformTestData = Pick<
  TransformTest,
  "id" | "name" | "transform_id" | "transform"
>;

type RemoteSyncItemDataByModel = {
  action: RemoteSyncActionData;
  card: RemoteSyncCardData;
  cardtest: RemoteSyncCardTestData;
  collection: RemoteSyncCollectionData;
  dashboard: RemoteSyncDashboardData;
  dataapp: RemoteSyncDataAppData;
  dimension: RemoteSyncDimensionData;
  document: RemoteSyncDocumentData;
  fieldusersettings: RemoteSyncFieldUserSettingsData;
  glossary: RemoteSyncGlossaryData;
  measure: RemoteSyncMeasureData;
  nativequerysnippet: RemoteSyncNativeQuerySnippetData;
  pythonlibrary: RemoteSyncPythonLibraryData;
  segment: RemoteSyncSegmentData;
  tableusersettings: RemoteSyncTableUserSettingsData;
  timeline: RemoteSyncTimelineData;
  transform: RemoteSyncTransformData;
  transformtag: RemoteSyncTransformTagData;
  transformtest: RemoteSyncTransformTestData;
};

export type RemoteSyncItemModel = keyof RemoteSyncItemDataByModel;

export type RemoteSyncItemData<
  TModel extends RemoteSyncItemModel = RemoteSyncItemModel,
> = RemoteSyncItemDataByModel[TModel];

export type RemoteSyncDirtyItemStatus =
  | "create"
  | "update"
  | "delete"
  | "removed";

export type RemoteSyncItem<
  TModel extends RemoteSyncItemModel = RemoteSyncItemModel,
> = {
  [M in TModel]: {
    id: RemoteSyncItemId;
    model: M;
    data: RemoteSyncItemData<M>;
    used_by?: RemoteSyncItem[];
  };
}[TModel];

export type RemoteSyncDirtyItem<
  TModel extends RemoteSyncItemModel = RemoteSyncItemModel,
> = {
  [M in TModel]: {
    id: RemoteSyncItemId;
    model: M;
    name: string;
    sync_status: RemoteSyncDirtyItemStatus;
    data: RemoteSyncItemData<M> | null;
  };
}[TModel];

export type RemoteSyncUnsyncedDependenciesErrorData = {
  message: string;
  "error-code": "unsynced-dependencies";
  unsynced_dependencies: RemoteSyncItem[];
};

export type RemoteSyncUnsyncedDependenciesError = {
  data: RemoteSyncUnsyncedDependenciesErrorData;
};

export type RemoteSyncChangesResponse = {
  dirty: RemoteSyncDirtyItem[];
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

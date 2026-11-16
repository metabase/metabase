import type {
  ExportChangesResponse,
  ExportPreflightResponse,
  ForcePushCasualties,
  GetBranchesResponse,
  HasRemoteChangesResponse,
  ImportChangesResponse,
  RemoteSyncActionData,
  RemoteSyncCardData,
  RemoteSyncCardTestData,
  RemoteSyncChangesResponse,
  RemoteSyncCollectionData,
  RemoteSyncDashboardData,
  RemoteSyncDataAppData,
  RemoteSyncDimensionData,
  RemoteSyncDirtyItem,
  RemoteSyncDocumentData,
  RemoteSyncFieldUserSettingsData,
  RemoteSyncGlossaryData,
  RemoteSyncIsDirtyResponse,
  RemoteSyncItem,
  RemoteSyncItemData,
  RemoteSyncItemModel,
  RemoteSyncMeasureData,
  RemoteSyncMergeSummary,
  RemoteSyncNativeQuerySnippetData,
  RemoteSyncPulledOutcome,
  RemoteSyncPythonLibraryData,
  RemoteSyncSegmentData,
  RemoteSyncTableUserSettingsData,
  RemoteSyncTask,
  RemoteSyncTimelineData,
  RemoteSyncTransformData,
  RemoteSyncTransformTagData,
  RemoteSyncTransformTestData,
  RemoteSyncUnsyncedDependenciesErrorData,
  StashChangesResponse,
  TestRemoteSyncConnectionResponse,
  UpdateRemoteSyncSettingsResponse,
} from "../remote-sync";

export function createMockRemoteSyncActionData(
  opts?: Partial<RemoteSyncActionData>,
): RemoteSyncActionData {
  return {
    id: 1,
    name: "Action",
    type: "query",
    model_id: null,
    collection_id: null,
    ...opts,
  };
}

export function createMockRemoteSyncCardData(
  opts?: Partial<RemoteSyncCardData>,
): RemoteSyncCardData {
  return { id: 1, name: "Card", collection_id: null, ...opts };
}

export function createMockRemoteSyncCardTestData(
  opts?: Partial<RemoteSyncCardTestData>,
): RemoteSyncCardTestData {
  return { id: 1, name: "Card test", card_id: 1, ...opts };
}

export function createMockRemoteSyncCollectionData(
  opts?: Partial<RemoteSyncCollectionData>,
): RemoteSyncCollectionData {
  return { id: 1, name: "Collection", location: "/", ...opts };
}

export function createMockRemoteSyncDashboardData(
  opts?: Partial<RemoteSyncDashboardData>,
): RemoteSyncDashboardData {
  return { id: 1, name: "Dashboard", collection_id: null, ...opts };
}

export function createMockRemoteSyncDataAppData(
  opts?: Partial<RemoteSyncDataAppData>,
): RemoteSyncDataAppData {
  return { id: 1, slug: "app", name: "App", ...opts };
}

export function createMockRemoteSyncDimensionData(
  opts?: Partial<RemoteSyncDimensionData>,
): RemoteSyncDimensionData {
  return { id: 1, field_id: 1, name: "Dimension", ...opts };
}

export function createMockRemoteSyncDocumentData(
  opts?: Partial<RemoteSyncDocumentData>,
): RemoteSyncDocumentData {
  return { id: 1, name: "Document", collection_id: null, ...opts };
}

export function createMockRemoteSyncFieldUserSettingsData(
  opts?: Partial<RemoteSyncFieldUserSettingsData>,
): RemoteSyncFieldUserSettingsData {
  return { field_id: 1, display_name: null, ...opts };
}

export function createMockRemoteSyncGlossaryData(
  opts?: Partial<RemoteSyncGlossaryData>,
): RemoteSyncGlossaryData {
  return { id: 1, term: "Term", ...opts };
}

export function createMockRemoteSyncMeasureData(
  opts?: Partial<RemoteSyncMeasureData>,
): RemoteSyncMeasureData {
  return { id: 1, name: "Measure", table_id: 1, ...opts };
}

export function createMockRemoteSyncNativeQuerySnippetData(
  opts?: Partial<RemoteSyncNativeQuerySnippetData>,
): RemoteSyncNativeQuerySnippetData {
  return { id: 1, name: "Snippet", collection_id: null, ...opts };
}

export function createMockRemoteSyncPythonLibraryData(
  opts?: Partial<RemoteSyncPythonLibraryData>,
): RemoteSyncPythonLibraryData {
  return { id: 1, path: "common.py", ...opts };
}

export function createMockRemoteSyncSegmentData(
  opts?: Partial<RemoteSyncSegmentData>,
): RemoteSyncSegmentData {
  return { id: 1, name: "Segment", table_id: 1, ...opts };
}

export function createMockRemoteSyncTableUserSettingsData(
  opts?: Partial<RemoteSyncTableUserSettingsData>,
): RemoteSyncTableUserSettingsData {
  return { table_id: 1, display_name: null, collection_id: null, ...opts };
}

export function createMockRemoteSyncTimelineData(
  opts?: Partial<RemoteSyncTimelineData>,
): RemoteSyncTimelineData {
  return { id: 1, name: "Timeline", collection_id: null, ...opts };
}

export function createMockRemoteSyncTransformData(
  opts?: Partial<RemoteSyncTransformData>,
): RemoteSyncTransformData {
  return { id: 1, name: "Transform", collection_id: null, ...opts };
}

export function createMockRemoteSyncTransformTagData(
  opts?: Partial<RemoteSyncTransformTagData>,
): RemoteSyncTransformTagData {
  return { id: 1, name: "Tag", ...opts };
}

export function createMockRemoteSyncTransformTestData(
  opts?: Partial<RemoteSyncTransformTestData>,
): RemoteSyncTransformTestData {
  return { id: 1, name: "Transform test", transform_id: 1, ...opts };
}

export function createMockRemoteSyncItem<TModel extends RemoteSyncItemModel>(
  opts: Partial<RemoteSyncItem<TModel>> & {
    model: TModel;
    data: RemoteSyncItemData<TModel>;
  },
): RemoteSyncItem<TModel> {
  return {
    id: 1,
    ...opts,
  };
}

export function createMockRemoteSyncDirtyItem<
  TModel extends RemoteSyncItemModel,
>(
  opts: Partial<RemoteSyncDirtyItem<TModel>> & { model: TModel },
): RemoteSyncDirtyItem<TModel> {
  return {
    id: 1,
    name: "Item",
    sync_status: "update",
    data: null,
    ...opts,
  };
}

export const createMockRemoteSyncTask = (
  opts?: Partial<RemoteSyncTask>,
): RemoteSyncTask => ({
  id: 1,
  sync_task_type: "import",
  status: "running",
  progress: 0,
  started_at: "2026-01-01T00:00:00Z",
  ...opts,
});

export const createMockRemoteSyncUnsyncedDependenciesErrorData = (
  opts?: Partial<RemoteSyncUnsyncedDependenciesErrorData>,
): RemoteSyncUnsyncedDependenciesErrorData => ({
  message: "Synced content uses content that isn't synced.",
  "error-code": "unsynced-dependencies",
  unsynced_dependencies: [],
  ...opts,
});

export const createMockRemoteSyncPulledOutcome = (
  opts?: Partial<RemoteSyncPulledOutcome>,
): RemoteSyncPulledOutcome => ({
  kind: "pulled",
  count: 1,
  branch: "main",
  ...opts,
});

export const createMockRemoteSyncMergeSummary = (
  opts?: Partial<RemoteSyncMergeSummary>,
): RemoteSyncMergeSummary => ({
  added: 0,
  updated: 0,
  removed: 0,
  ...opts,
});

export const createMockForcePushCasualties = (
  opts?: Partial<ForcePushCasualties>,
): ForcePushCasualties => ({
  deleted: [],
  overwritten: [],
  ...opts,
});

export const createMockExportPreflightResponse = (
  opts?: Partial<ExportPreflightResponse>,
): ExportPreflightResponse => ({
  has_changes: false,
  clean: true,
  conflicts: [],
  summary: createMockRemoteSyncMergeSummary(),
  force_push_casualties: createMockForcePushCasualties(),
  reason: null,
  ...opts,
});

export const createMockGetBranchesResponse = (
  opts?: Partial<GetBranchesResponse>,
): GetBranchesResponse => ({
  items: [],
  ...opts,
});

export const createMockRemoteSyncIsDirtyResponse = (
  opts?: Partial<RemoteSyncIsDirtyResponse>,
): RemoteSyncIsDirtyResponse => ({
  is_dirty: false,
  ...opts,
});

export const createMockHasRemoteChangesResponse = (
  opts?: Partial<HasRemoteChangesResponse>,
): HasRemoteChangesResponse => ({
  has_changes: false,
  remote_version: "remote",
  local_version: "remote",
  ...opts,
});

export const createMockImportChangesResponse = (
  opts?: Partial<ImportChangesResponse>,
): ImportChangesResponse => ({
  status: "success",
  task_id: 1,
  ...opts,
});

export const createMockExportChangesResponse = (
  opts?: Partial<ExportChangesResponse>,
): ExportChangesResponse => ({
  message: "Export task started",
  task_id: 1,
  ...opts,
});

export const createMockStashChangesResponse = (
  opts?: Partial<StashChangesResponse>,
): StashChangesResponse => ({
  status: "success",
  message: "Stashing",
  task_id: 1,
  ...opts,
});

export const createMockUpdateRemoteSyncSettingsResponse = (
  opts?: Partial<UpdateRemoteSyncSettingsResponse>,
): UpdateRemoteSyncSettingsResponse => ({
  success: true,
  ...opts,
});

export const createMockTestRemoteSyncConnectionResponse = (
  opts?: Partial<TestRemoteSyncConnectionResponse>,
): TestRemoteSyncConnectionResponse => ({
  status: "success",
  ...opts,
});

export const createMockRemoteSyncChangesResponse = (
  opts?: Partial<RemoteSyncChangesResponse>,
): RemoteSyncChangesResponse => ({
  dirty: [],
  ...opts,
});

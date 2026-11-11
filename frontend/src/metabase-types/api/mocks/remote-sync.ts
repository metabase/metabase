import type {
  ExportChangesResponse,
  ExportPreflightResponse,
  ForcePushCasualties,
  GetBranchesResponse,
  HasRemoteChangesResponse,
  ImportChangesResponse,
  RemoteSyncChangesResponse,
  RemoteSyncEntity,
  RemoteSyncEntityCollection,
  RemoteSyncEntityCollectionAncestor,
  RemoteSyncEntityParent,
  RemoteSyncEntityRef,
  RemoteSyncIsDirtyResponse,
  RemoteSyncMergeSummary,
  RemoteSyncPulledOutcome,
  RemoteSyncTask,
  RemoteSyncUnsyncedDependenciesErrorData,
  RemoteSyncUnsyncedDependency,
  StashChangesResponse,
  TestRemoteSyncConnectionResponse,
  UpdateRemoteSyncSettingsResponse,
} from "../remote-sync";

export const createMockRemoteSyncEntityParent = (
  opts?: Partial<RemoteSyncEntityParent>,
): RemoteSyncEntityParent => ({
  model: "tableusersettings",
  id: 1,
  name: "Orders",
  ...opts,
});

export const createMockRemoteSyncEntity = (
  opts?: Partial<RemoteSyncEntity>,
): RemoteSyncEntity => ({
  id: 1,
  name: "My Question",
  model: "card",
  sync_status: "update",
  ...opts,
});

export const createMockRemoteSyncEntityCollectionAncestor = (
  opts?: Partial<RemoteSyncEntityCollectionAncestor>,
): RemoteSyncEntityCollectionAncestor => ({
  id: 1,
  name: "Parent collection",
  type: null,
  personal_owner_id: null,
  ...opts,
});

export const createMockRemoteSyncEntityCollection = (
  opts?: Partial<RemoteSyncEntityCollection>,
): RemoteSyncEntityCollection => ({
  id: 2,
  name: "Collection",
  type: null,
  effective_ancestors: [],
  ...opts,
});

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

export const createMockRemoteSyncEntityRef = (
  opts?: Partial<RemoteSyncEntityRef>,
): RemoteSyncEntityRef => ({
  id: 1,
  name: "Dashboard",
  model: "dashboard",
  ...opts,
});

export const createMockRemoteSyncUnsyncedDependency = (
  opts?: Partial<RemoteSyncUnsyncedDependency>,
): RemoteSyncUnsyncedDependency => ({
  id: 1,
  name: "Card",
  model: "card",
  used_by: [],
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

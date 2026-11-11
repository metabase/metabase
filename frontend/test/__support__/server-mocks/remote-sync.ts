import fetchMock from "fetch-mock";

import type {
  ExportPreflightResponse,
  GetBranchesResponse,
  HasRemoteChangesResponse,
  RemoteSyncEntity,
  RemoteSyncTask,
  RemoteSyncTaskId,
  RemoteSyncUnsyncedDependenciesErrorData,
  UpdateRemoteSyncSettingsResponse,
} from "metabase-types/api";
import {
  createMockExportChangesResponse,
  createMockExportPreflightResponse,
  createMockGetBranchesResponse,
  createMockHasRemoteChangesResponse,
  createMockImportChangesResponse,
  createMockRemoteSyncChangesResponse,
  createMockRemoteSyncIsDirtyResponse,
  createMockStashChangesResponse,
  createMockTestRemoteSyncConnectionResponse,
  createMockUpdateRemoteSyncSettingsResponse,
} from "metabase-types/api/mocks";

const REMOTE_SYNC_SETTINGS_ROUTE = "remote-sync-settings";

export function setupRemoteSyncBranchesEndpoint(
  response: GetBranchesResponse = createMockGetBranchesResponse(),
) {
  fetchMock.get("path:/api/ee/remote-sync/branches", response);
}

export function setupRemoteSyncDirtyEndpoint(dirty: RemoteSyncEntity[] = []) {
  fetchMock.get(
    "path:/api/ee/remote-sync/dirty",
    createMockRemoteSyncChangesResponse({ dirty }),
  );
  fetchMock.get(
    "path:/api/ee/remote-sync/is-dirty",
    createMockRemoteSyncIsDirtyResponse({ is_dirty: dirty.length > 0 }),
  );
}

export function setupRemoteSyncHasRemoteChangesEndpoint(
  response: HasRemoteChangesResponse = createMockHasRemoteChangesResponse(),
) {
  fetchMock.get("path:/api/ee/remote-sync/has-remote-changes", response);
}

export function setupRemoteSyncCurrentTaskEndpoint(
  task: RemoteSyncTask | null = null,
) {
  fetchMock.get("path:/api/ee/remote-sync/current-task", task ?? 204);
}

export function setupRemoteSyncCancelTaskEndpoint() {
  fetchMock.post("path:/api/ee/remote-sync/current-task/cancel", 200);
}

export function setupRemoteSyncExportPreflightEndpoint(
  response: ExportPreflightResponse = createMockExportPreflightResponse(),
) {
  fetchMock.get("path:/api/ee/remote-sync/export-preflight", response);
}

export function setupRemoteSyncImportEndpoint() {
  fetchMock.post(
    "path:/api/ee/remote-sync/import",
    createMockImportChangesResponse(),
  );
}

export function setupRemoteSyncExportEndpoint() {
  fetchMock.post(
    "path:/api/ee/remote-sync/export",
    createMockExportChangesResponse(),
  );
}

export function setupRemoteSyncStashEndpoint() {
  fetchMock.post(
    "path:/api/ee/remote-sync/stash",
    createMockStashChangesResponse(),
  );
}

export function setupRemoteSyncSettingsEndpoint(
  response: UpdateRemoteSyncSettingsResponse = createMockUpdateRemoteSyncSettingsResponse(),
) {
  fetchMock.removeRoute(REMOTE_SYNC_SETTINGS_ROUTE);
  fetchMock.put("path:/api/ee/remote-sync/settings", response, {
    name: REMOTE_SYNC_SETTINGS_ROUTE,
  });
}

export function setupRemoteSyncSettingsEndpointError(
  error: RemoteSyncUnsyncedDependenciesErrorData,
) {
  fetchMock.removeRoute(REMOTE_SYNC_SETTINGS_ROUTE);
  fetchMock.put(
    "path:/api/ee/remote-sync/settings",
    { status: 400, body: error },
    { name: REMOTE_SYNC_SETTINGS_ROUTE },
  );
}

export function setupRemoteSyncTestConnectionEndpoint() {
  fetchMock.post(
    "path:/api/ee/remote-sync/test-connection",
    createMockTestRemoteSyncConnectionResponse(),
  );
}

type SetupRemoteSyncEndpointsOpts = {
  dirty?: RemoteSyncEntity[];
  hasRemoteChanges?: boolean;
  currentTask?: RemoteSyncTask | null;
  settingsTaskId?: RemoteSyncTaskId;
};

export function setupRemoteSyncEndpoints({
  dirty = [],
  hasRemoteChanges = false,
  currentTask = null,
  settingsTaskId,
}: SetupRemoteSyncEndpointsOpts = {}) {
  setupRemoteSyncBranchesEndpoint(
    createMockGetBranchesResponse({ items: ["main", "develop"] }),
  );
  setupRemoteSyncDirtyEndpoint(dirty);
  setupRemoteSyncHasRemoteChangesEndpoint(
    createMockHasRemoteChangesResponse({
      has_changes: hasRemoteChanges,
      local_version: hasRemoteChanges ? "local" : "remote",
    }),
  );
  setupRemoteSyncCurrentTaskEndpoint(currentTask);
  setupRemoteSyncCancelTaskEndpoint();
  setupRemoteSyncExportPreflightEndpoint();
  setupRemoteSyncImportEndpoint();
  setupRemoteSyncExportEndpoint();
  setupRemoteSyncStashEndpoint();
  setupRemoteSyncSettingsEndpoint(
    createMockUpdateRemoteSyncSettingsResponse(
      settingsTaskId != null ? { task_id: settingsTaskId } : {},
    ),
  );
  setupRemoteSyncTestConnectionEndpoint();
}

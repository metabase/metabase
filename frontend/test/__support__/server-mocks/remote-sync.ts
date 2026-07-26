import fetchMock from "fetch-mock";

import type { RemoteSyncEntity, RemoteSyncWorktree } from "metabase-types/api";

export interface RemoteSyncDirtyResponse {
  dirty: RemoteSyncEntity[];
  changedCollections: Record<number, boolean>;
}

/**
 * Setup the remote-sync dirty endpoint
 */
export const setupRemoteSyncDirtyEndpoint = ({
  dirty = [],
  changedCollections = {},
}: Partial<RemoteSyncDirtyResponse> = {}) => {
  fetchMock.removeRoute("remote-sync-dirty");
  fetchMock.get(
    "path:/api/ee/remote-sync/dirty",
    { dirty, changedCollections },
    { name: "remote-sync-dirty" },
  );
};

/**
 * Setup the remote-sync branches endpoint
 */
export const setupRemoteSyncBranchesEndpoint = (
  branches: string[] = ["main", "develop"],
) => {
  fetchMock.removeRoute("remote-sync-branches");
  fetchMock.get(
    "path:/api/ee/remote-sync/branch",
    { items: branches },
    { name: "remote-sync-branches" },
  );
};

/**
 * Setup the remote-sync current-task endpoint
 */
const setupRemoteSyncCurrentTaskEndpoint = (
  status: "idle" | "running" | "completed" = "idle",
) => {
  fetchMock.removeRoute("remote-sync-current-task");
  fetchMock.get(
    "path:/api/ee/remote-sync/current-task",
    { status },
    { name: "remote-sync-current-task" },
  );
};

export interface RemoteSyncSettingsResponse {
  success: boolean;
  task_id?: number;
}

/**
 * Setup the remote-sync settings PUT endpoint
 */
export const setupRemoteSyncSettingsEndpoint = ({
  success = true,
  task_id,
  error,
}: Partial<RemoteSyncSettingsResponse> & {
  error?: { status: number; message: string };
} = {}) => {
  fetchMock.removeRoute("remote-sync-settings");
  if (error) {
    fetchMock.put(
      "path:/api/ee/remote-sync/settings",
      { status: error.status, body: { message: error.message } },
      { name: "remote-sync-settings" },
    );
  } else {
    fetchMock.put(
      "path:/api/ee/remote-sync/settings",
      { success, ...(task_id !== undefined && { task_id }) },
      { name: "remote-sync-settings" },
    );
  }
};

/**
 * Setup the remote-sync import POST endpoint
 */
export const setupRemoteSyncImportEndpoint = ({
  status = "running",
  task_id = 456,
}: { status?: string; task_id?: number } = {}) => {
  fetchMock.removeRoute("remote-sync-import");
  fetchMock.post(
    "path:/api/ee/remote-sync/import",
    { status, task_id },
    { name: "remote-sync-import" },
  );
};

/**
 * Setup the remote-sync export POST endpoint
 */
export const setupRemoteSyncExportEndpoint = ({
  task_id = 789,
}: { task_id?: number } = {}) => {
  fetchMock.removeRoute("remote-sync-export");
  fetchMock.post(
    "path:/api/ee/remote-sync/export",
    { message: "Export task started", task_id },
    { name: "remote-sync-export" },
  );
};

export interface RemoteSyncExportPreflightResponse {
  has_changes: boolean;
  clean: boolean;
  conflicts: string[];
  summary: { added: number; updated: number; removed: number };
  reason: string | null;
}

/**
 * Setup the remote-sync export-preflight endpoint (drives the push decision)
 */
export const setupRemoteSyncExportPreflightEndpoint = ({
  has_changes = false,
  clean = true,
  conflicts = [],
  summary = { added: 0, updated: 0, removed: 0 },
  reason = null,
}: Partial<RemoteSyncExportPreflightResponse> = {}) => {
  fetchMock.removeRoute("remote-sync-export-preflight");
  fetchMock.get(
    "path:/api/ee/remote-sync/export-preflight",
    { has_changes, clean, conflicts, summary, reason },
    { name: "remote-sync-export-preflight" },
  );
};

/**
 * Setup the remote-sync cancel task endpoint
 */
export const setupRemoteSyncCancelTaskEndpoint = ({
  status = 200,
  body = {},
  delay = 0,
}: { status?: number; body?: any; delay?: number } = {}) => {
  fetchMock.removeRoute("remote-sync-cancel-task");
  if (status === 200) {
    fetchMock.post("path:/api/ee/remote-sync/current-task/cancel", body, {
      name: "remote-sync-cancel-task",
      delay,
    });
  } else {
    fetchMock.post(
      "path:/api/ee/remote-sync/current-task/cancel",
      { status, body },
      { name: "remote-sync-cancel-task", delay },
    );
  }
};

/**
 * Setup the remote-sync test-connection POST endpoint
 */
export const setupRemoteSyncTestConnectionEndpoint = ({
  error,
}: {
  error?: { status: number; message: string };
} = {}) => {
  fetchMock.removeRoute("remote-sync-test-connection");
  if (error) {
    fetchMock.post(
      "path:/api/ee/remote-sync/test-connection",
      { status: error.status, body: { message: error.message } },
      { name: "remote-sync-test-connection" },
    );
  } else {
    fetchMock.post(
      "path:/api/ee/remote-sync/test-connection",
      { status: "success" },
      { name: "remote-sync-test-connection" },
    );
  }
};

/**
 * Setup the remote-sync worktree GET endpoint
 */
export const setupRemoteSyncWorktreeEndpoint = (
  worktreeId: number,
  worktree: RemoteSyncWorktree,
  { delay = 0 }: { delay?: number } = {},
) => {
  fetchMock.removeRoute("remote-sync-worktree");
  fetchMock.get(`path:/api/ee/remote-sync/worktree/${worktreeId}`, worktree, {
    name: "remote-sync-worktree",
    delay,
  });
};

/**
 * Setup the remote-sync worktree list GET endpoint
 */
export const setupListWorktreesEndpoint = (worktrees: RemoteSyncWorktree[]) => {
  fetchMock.removeRoute("remote-sync-worktree-list");
  fetchMock.get("path:/api/ee/remote-sync/worktree", worktrees, {
    name: "remote-sync-worktree-list",
  });
};

/**
 * Setup the remote-sync worktree creation POST endpoint
 */
export const setupCreateWorktreeEndpoint = (
  worktree: RemoteSyncWorktree,
  { error }: { error?: { status: number; message: string } } = {},
) => {
  fetchMock.removeRoute("remote-sync-worktree-create");
  if (error) {
    fetchMock.post(
      "path:/api/ee/remote-sync/worktree",
      { status: error.status, body: { message: error.message } },
      { name: "remote-sync-worktree-create" },
    );
  } else {
    fetchMock.post("path:/api/ee/remote-sync/worktree", worktree, {
      name: "remote-sync-worktree-create",
    });
  }
};

/**
 * Setup the remote-sync worktree deletion DELETE endpoint
 */
export const setupDeleteWorktreeEndpoint = (
  worktreeId: number,
  { error }: { error?: { status: number; message: string } } = {},
) => {
  fetchMock.removeRoute("remote-sync-worktree-delete");
  if (error) {
    fetchMock.delete(
      `path:/api/ee/remote-sync/worktree/${worktreeId}`,
      { status: error.status, body: { message: error.message } },
      { name: "remote-sync-worktree-delete" },
    );
  } else {
    fetchMock.delete(`path:/api/ee/remote-sync/worktree/${worktreeId}`, 204, {
      name: "remote-sync-worktree-delete",
    });
  }
};

/**
 * Setup all remote-sync endpoints at once
 */
export const setupRemoteSyncEndpoints = ({
  branches = ["main", "develop"],
  dirty = [],
  changedCollections = {},
  hasRemoteChanges = false,
  hasRemoteChangesDelay = 0,
  hasRemoteChangesError = false,
  exportPreflight,
  settingsResponse = { success: true },
  testConnectionError,
}: {
  branches?: string[];
  dirty?: RemoteSyncEntity[];
  changedCollections?: Record<number, boolean>;
  hasRemoteChanges?: boolean;
  hasRemoteChangesDelay?: number;
  hasRemoteChangesError?: boolean;
  exportPreflight?: Partial<RemoteSyncExportPreflightResponse>;
  settingsResponse?: Partial<RemoteSyncSettingsResponse> & {
    error?: { status: number; message: string };
  };
  testConnectionError?: { status: number; message: string };
} = {}) => {
  setupRemoteSyncBranchesEndpoint(branches);
  setupRemoteSyncDirtyEndpoint({ dirty, changedCollections });
  setupRemoteSyncCurrentTaskEndpoint("idle");
  setupRemoteSyncImportEndpoint();
  setupRemoteSyncExportEndpoint();
  setupRemoteSyncExportPreflightEndpoint(exportPreflight);
  setupRemoteSyncSettingsEndpoint(settingsResponse);
  setupRemoteSyncTestConnectionEndpoint({ error: testConnectionError });
  fetchMock.post("path:/api/ee/remote-sync/branch", {});
  fetchMock.get(
    "path:/api/ee/remote-sync/has-remote-changes",
    hasRemoteChangesError
      ? 401
      : {
          has_changes: hasRemoteChanges,
        },
    {
      delay: hasRemoteChangesDelay,
    },
  );
};

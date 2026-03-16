import fetchMock from "fetch-mock";

import type { RemoteSyncEntity } from "metabase-types/api";

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
    "path:/api/ee/remote-sync/branches",
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
 * Setup all remote-sync endpoints at once
 */
export const setupRemoteSyncEndpoints = ({
  branches = ["main", "develop"],
  dirty = [],
  changedCollections = {},
  hasRemoteChanges = false,
  hasRemoteChangesDelay = 0,
  settingsResponse = { success: true },
}: {
  branches?: string[];
  dirty?: RemoteSyncEntity[];
  changedCollections?: Record<number, boolean>;
  hasRemoteChanges?: boolean;
  hasRemoteChangesDelay?: number;
  settingsResponse?: Partial<RemoteSyncSettingsResponse> & {
    error?: { status: number; message: string };
  };
} = {}) => {
  setupRemoteSyncBranchesEndpoint(branches);
  setupRemoteSyncDirtyEndpoint({ dirty, changedCollections });
  setupRemoteSyncCurrentTaskEndpoint("idle");
  setupRemoteSyncImportEndpoint();
  setupRemoteSyncSettingsEndpoint(settingsResponse);
  fetchMock.post("path:/api/ee/remote-sync/create-branch", {});
  fetchMock.get(
    "path:/api/ee/remote-sync/has-remote-changes",
    {
      has_changes: hasRemoteChanges,
    },
    {
      delay: hasRemoteChangesDelay,
    },
  );
};

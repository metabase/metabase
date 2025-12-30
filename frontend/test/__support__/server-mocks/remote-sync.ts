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
export const setupRemoteSyncCurrentTaskEndpoint = (
  status: "idle" | "running" | "completed" = "idle",
) => {
  fetchMock.removeRoute("remote-sync-current-task");
  fetchMock.get(
    "path:/api/ee/remote-sync/current-task",
    { status },
    { name: "remote-sync-current-task" },
  );
};

/**
 * Setup all remote-sync endpoints at once
 */
export const setupRemoteSyncEndpoints = ({
  branches = ["main", "develop"],
  dirty = [],
  changedCollections = {},
}: {
  branches?: string[];
  dirty?: RemoteSyncEntity[];
  changedCollections?: Record<number, boolean>;
} = {}) => {
  setupRemoteSyncBranchesEndpoint(branches);
  setupRemoteSyncDirtyEndpoint({ dirty, changedCollections });
  setupRemoteSyncCurrentTaskEndpoint("idle");
  fetchMock.post("path:/api/ee/remote-sync/import", {});
  fetchMock.post("path:/api/ee/remote-sync/create-branch", {});
  fetchMock.get("path:/api/ee/remote-sync/current-task", { status: "idle" });
  fetchMock.put("path:/api/ee/remote-sync/settings", { success: true });
};

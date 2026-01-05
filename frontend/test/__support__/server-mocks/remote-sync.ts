import fetchMock from "fetch-mock";

import type { RemoteSyncEntity } from "metabase-types/api";

export const setupRemoteSyncEndpoints = ({
  branches = ["main", "develop"],
  dirty = [],
  changedCollections = {},
}: {
  branches?: string[];
  dirty?: RemoteSyncEntity[];
  changedCollections?: Record<number, boolean>;
} = {}) => {
  fetchMock.get("path:/api/ee/remote-sync/branches", { items: branches });
  fetchMock.get("path:/api/ee/remote-sync/dirty", {
    dirty,
    changedCollections,
  });
  fetchMock.post("path:/api/ee/remote-sync/import", {});
  fetchMock.post("path:/api/ee/remote-sync/create-branch", {});
  fetchMock.get("path:/api/ee/remote-sync/current-task", { status: "idle" });

  fetchMock.put("path:/api/ee/remote-sync/settings", { success: true });
};

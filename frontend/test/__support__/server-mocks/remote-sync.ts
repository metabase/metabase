import fetchMock from "fetch-mock";

import type {
  ExportPreflightResponse,
  RemoteSyncEntity,
  RemoteSyncTask,
} from "metabase-types/api";

type SetupRemoteSyncEndpointsOpts = {
  branches?: string[];
  dirty?: RemoteSyncEntity[];
  currentTask?: RemoteSyncTask | null;
  exportPreflight?: ExportPreflightResponse;
};

const DEFAULT_EXPORT_PREFLIGHT: ExportPreflightResponse = {
  has_changes: false,
  clean: true,
  conflicts: [],
  summary: { added: 0, updated: 0, removed: 0 },
  force_push_casualties: { deleted: [], overwritten: [] },
  reason: null,
};

export const setupRemoteSyncEndpoints = ({
  branches = ["main", "develop"],
  dirty = [],
  currentTask = null,
  exportPreflight = DEFAULT_EXPORT_PREFLIGHT,
}: SetupRemoteSyncEndpointsOpts = {}) => {
  fetchMock.get("path:/api/ee/remote-sync/branches", { items: branches });
  fetchMock.get("path:/api/ee/remote-sync/dirty", { dirty });
  fetchMock.get("path:/api/ee/remote-sync/current-task", currentTask ?? 204);
  fetchMock.get("path:/api/ee/remote-sync/export-preflight", exportPreflight);
  fetchMock.post("path:/api/ee/remote-sync/import", {
    status: "success",
    task_id: 1,
  });
  fetchMock.post("path:/api/ee/remote-sync/export", {
    message: "Export task started",
    task_id: 1,
  });
  fetchMock.post("path:/api/ee/remote-sync/stash", {
    status: "success",
    message: "Stashing",
    task_id: 1,
  });
  fetchMock.put("path:/api/ee/remote-sync/settings", { success: true });
  fetchMock.post("path:/api/ee/remote-sync/test-connection", {
    status: "success",
  });
};

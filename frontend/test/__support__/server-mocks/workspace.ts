import fetchMock from "fetch-mock";

import type { Workspace, WorkspaceId } from "metabase-types/api";

export function setupListWorkspacesEndpoint(workspaces: Workspace[]) {
  fetchMock.get("path:/api/ee/workspace", workspaces);
}

export function setupGetWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.get(`path:/api/ee/workspace/${workspace.id}`, workspace);
}

export function setupCreateWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.post("path:/api/ee/workspace", workspace);
}

export function setupUpdateWorkspaceEndpoint(workspace: Workspace) {
  fetchMock.put(`path:/api/ee/workspace/${workspace.id}`, workspace);
}

export function setupDeleteWorkspaceEndpoint(id: WorkspaceId) {
  fetchMock.delete(`path:/api/ee/workspace/${id}`, { id, deleted: true });
}

export function setupProvisionWorkspaceEndpoint(
  id: WorkspaceId,
  triggered = 1,
) {
  fetchMock.post(`path:/api/ee/workspace/${id}/provision`, {
    workspace_id: id,
    triggered,
  });
}

export function setupDeprovisionWorkspaceEndpoint(
  id: WorkspaceId,
  triggered = 1,
) {
  fetchMock.post(`path:/api/ee/workspace/${id}/deprovision`, {
    workspace_id: id,
    triggered,
  });
}
